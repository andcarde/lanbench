param(
    [string]$Image = "andcarde/lanbench:latest",
    [string]$ComposeFile = "docker-compose.yaml",
    [switch]$SkipTempDbCheck
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$suffix = [guid]::NewGuid().ToString("N").Substring(0, 8)
$networkName = "lanbench-publish-$timestamp-$suffix"
$dbName = "$networkName-db"
$dbName = $dbName.Substring(0, [Math]::Min($dbName.Length, 63))
$dbPassword = "tmp$([guid]::NewGuid().ToString("N"))"
$rootPassword = "root$([guid]::NewGuid().ToString("N"))"

function Run-Step {
    param(
        [string]$Message,
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Message"
    & $Command
}

function Invoke-Native {
    param(
        [scriptblock]$Command,
        [string]$ErrorMessage = "Command failed"
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$ErrorMessage (exit code $LASTEXITCODE)."
    }
}

function Wait-ForTempDb {
    param(
        [string]$ContainerName,
        [string]$RootPassword,
        [string]$UserPassword,
        [string]$NetworkName
    )

    for ($attempt = 1; $attempt -le 60; $attempt++) {
        docker exec $ContainerName mariadb-admin ping "-uroot" "-p$RootPassword" --silent *> $null
        $localReady = ($LASTEXITCODE -eq 0)

        docker run --rm --network $NetworkName mariadb:11 mariadb-admin ping "-h$ContainerName" "-ulanbench" "-p$UserPassword" --silent *> $null
        $networkReady = ($LASTEXITCODE -eq 0)

        if ($localReady -and $networkReady) {
            return
        }

        Start-Sleep -Seconds 2
    }

    throw "Timed out waiting for temporary MariaDB container '$ContainerName'."
}

function Truncate-AllTables {
    param(
        [string]$ContainerName,
        [string]$Password
    )

    $truncateScriptTemplate = @'
set -e
{
  echo 'SET FOREIGN_KEY_CHECKS=0;'
  mariadb -ulanbench -p__PASSWORD__ -N -B -e 'SELECT CONCAT("TRUNCATE TABLE `", TABLE_NAME, "`;") FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = "BASE TABLE";' lanbench
  echo 'SET FOREIGN_KEY_CHECKS=1;'
} | mariadb -ulanbench -p__PASSWORD__ lanbench
'@

    $truncateScript = $truncateScriptTemplate.Replace("__PASSWORD__", $Password)
    $truncateScript | docker exec -i $ContainerName sh -c "tr -d '\r' | sh"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not truncate temporary database tables (exit code $LASTEXITCODE)."
    }
}

try {
    Run-Step "Checking Docker Desktop" {
        Invoke-Native -ErrorMessage "Docker Desktop is not available" -Command {
            docker info *> $null
        }
    }

    $env:LANBENCH_IMAGE = $Image

    Run-Step "Building app image as $Image" {
        Invoke-Native -ErrorMessage "Could not build app image" -Command {
            docker compose -f $ComposeFile build app
        }
    }

    if (-not $SkipTempDbCheck) {
        Run-Step "Creating isolated temporary MariaDB database" {
            Invoke-Native -ErrorMessage "Could not create temporary Docker network" -Command {
                docker network create $networkName | Out-Null
            }

            Invoke-Native -ErrorMessage "Could not create temporary MariaDB container" -Command {
                docker run -d `
                    --name $dbName `
                    --network $networkName `
                    -e MARIADB_ROOT_PASSWORD=$rootPassword `
                    -e MARIADB_DATABASE=lanbench `
                    -e MARIADB_USER=lanbench `
                    -e MARIADB_PASSWORD=$dbPassword `
                    mariadb:11 | Out-Null
            }
        }

        Run-Step "Waiting for temporary database" {
            Wait-ForTempDb -ContainerName $dbName -RootPassword $rootPassword -UserPassword $dbPassword -NetworkName $networkName
        }

        Run-Step "Applying Prisma schema to temporary database" {
            $databaseUrl = "mysql://lanbench:$dbPassword@${dbName}:3306/lanbench"
            Invoke-Native -ErrorMessage "Could not apply Prisma schema to temporary database" -Command {
                docker run --rm `
                    --network $networkName `
                    -e DATABASE_URL=$databaseUrl `
                    -e DB_HOST=$dbName `
                    -e DB_PORT=3306 `
                    -e DB_USER=lanbench `
                    -e DB_PASSWORD=$dbPassword `
                    -e DB_NAME=lanbench `
                    $Image npx prisma db push
            }
        }

        Run-Step "Truncating every table in temporary database" {
            Truncate-AllTables -ContainerName $dbName -Password $dbPassword
        }
    }

    Run-Step "Pushing only the app image to Docker Hub" {
        Invoke-Native -ErrorMessage "Could not push app image to Docker Hub" -Command {
            docker compose -f $ComposeFile push --quiet app
        }
    }

    Write-Host ""
    Write-Host "Done. Published $Image without touching the local database."
}
finally {
    if (-not $SkipTempDbCheck) {
        docker rm -f $dbName *> $null
        docker network rm $networkName *> $null
    }

    Remove-Item Env:\LANBENCH_IMAGE -ErrorAction SilentlyContinue
}
