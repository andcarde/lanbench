

model Section {
  idSection Int
  idDataset Int
  block     Int

  Dataset   Dataset @relation(fields: [idDataset], references: [idDataset])

  @@id([idSection])
}

model Dataset {
  idDataset Int    @id
  entries   Int
  content   Bytes

  sections  Section[]
  permits   Permits[]
}

model User {
  idUser   Int    @id
  email    String
  password String

  permits  Permits[]
}

model Permits {
  idDataset Int
  idUser    Int
  isOwned   Boolean

  dataset Dataset @relation(fields: [idDataset], references: [idDataset])
  user    User    @relation(fields: [idUser], references: [idUser])

  @@id([idDataset, idUser])
}