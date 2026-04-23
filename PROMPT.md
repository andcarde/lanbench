# Órdenes generales

1. Revisión de código: Revisarás un fichero concreto con el fin de localizar
antipatrones de software. Errores de sintaxis.

2. Documentación: Para cada función del fichero de código dado. Crearas un comentario profesional en el que determinarás para qué sirve la función, cúales son las precondiciones, en especial, que simbolizan las variables de entrada y que tipo de datos son. Lo mismo para la variable de salida. Los buenos comentarios no sólo cuentas información, sino información de dominio que viene bien para saber el para qué de la función.

3. Mejora de nombres: Utilizar nombres descriptivos, no ambigüos es básico para el mantenimiento de una aplicación. Esta tarea implica preguntarse si cada variable, función o clase tiene un nombre acorde y cambiarlo en caso de encontrar uno mejor.

4. Eliminación de código duplicado. Se detectará código duplicado en un fichero y se procederá a eliminarlo, para ello, es útil la creación de nuevas funciones que incorporan el comportamiento común o clases en caso de que dicho comportamiento este ligado a estructuras de datos que actuarán como atributos de clase.

5. Generación de tests. A partir de un fichero de desarrollo, se creará un fichero de test que validará que las funciones y clases definidas en el primero funcionan. Para generar tests válidos hay que lograr cobertura por rama (branch), un test por cada branch en una función. Cuando se crea un test aunque no basemos en la estructura de la función original debemos tratarla como caja negra lo máximo posible, aunque sea necesario mockear la respuesta de funciones que no estén en el fichero.

6. Tarea: Análisis de arquitectura de software.

El objetivo es eliminar problemas estructurales en un proyecto software. Para ello se establece esta tarea para lograr el subobjetivo de analizar la arquitectura de ese proyecto software, compararla con estándares de la industria y detectar problemas estructurales, poniendo atención en la cohesión y el acoplamiento.

Primero, identifica el tipo de arquitectura del sistema (por ejemplo: monolítica, en capas, hexagonal, microservicios u otra). Evalúa el nivel de cohesión de los componentes y el nivel de acoplamiento entre módulos y funciones. Compara la arquitectura observada con buenas prácticas de la industria, como separación de responsabilidades, modularidad y principios SOLID, e indica las desviaciones relevantes.

Segundo, detecta problemas en el código y clasifícalos en una de las siguientes categorías. Incoherencia: uso inconsistente de enfoques, datos o librerías sin justificación. Redundancia: código duplicado o no utilizado. Acoplamiento: dependencias excesivas entre componentes o responsabilidades mal separadas. Contrato: inconsistencias entre las precondiciones esperadas de una función y su uso real en las llamadas. Otros: cualquier problema no cubierto por las categorías anteriores, indicando su tipo.

Tercero, genera una tabla con los problemas detectados. La tabla debe incluir tres columnas: tipo de problema, scope (método, clase, fichero, paquete o general) y descripción del problema.

Cuarto, para cada problema identificado, asigna un nivel de complejidad de resolución entre los siguientes valores: mínima, baja, media, alta, muy alta o crítica.

Quinto, selecciona el modelo de menor capacidad que pueda realizar esta tarea con una tasa de éxito estimada de al menos el 95% entre las siguientes opciones: Claude Haiku Thinking, Claude Sonnet 4.6 Medium, Claude Sonnet 4.6 High, Claude Opus 4.7 Medium, Claude Opus 4.7 High y ChatGPT 5.4. Hazlo en función del problema: tipo y nivel de complejidad anteriormente determinados; y en función del modelo: capacidad de razonamiento y el volumen de contexto.

Finalmente, escribe la auditoría realizada en un nuevo fichero AUDITORIA-n.md donde n es la número de auditoría. Si no existe ningún AUDITORIA-n.md, pondrás n=1. Si existe este n será el siguiente al anterior.

6.1 Caso: Buen plan

Considero que el plan es correcto y que el prompt es muy completo por lo que ejecutarás todos los pasos de la tarea definida interrumpidamente

7. Objetivo: Análisis de cobertura de funcionalidades.

Comprueba si se cubren o no las funcionalidades definidas en las historias de usuario. Analiza la cobertura primero por historia de usuario, segundo por funcionalidad y tercero por capas (front, manejadores, routers, controladores, integración, ...).

Escribe la auditoría realizada en un nuevo fichero US-COBERTURA-n.md donde n es el número de auditoría. Si no existe ningún US-COBERTURA-n.md, pondrás n=1. Si existe este fichero, n será el siguiente al anterior.

8. Análisis de vulnerabilidades software. Se verificará que no existen vulnerabilidades de código. Si existiese se identificará según la denominación oficial (CVE) y según la importancia (leve, moderada, grave, crítica).

9. El objetivo es subsanar los problemas detectados en AUDITORIA-2.md. Para ello realiza resuelve los problemas que no han sido asignado a Claude Haiku en "2. Tabla de problemas detectados".

ChatGPT 5.4 ha estado trabajando en estas mismas tareas. Por ello debes averiguar cuales han sido realizadas para omitirlas y cuales están a medias para realizar un analisis previo del enfoque.

Sigue los pasos:
1. Detecta las dependencias entre tareas.
2. Genera un plan general donde se ordenen las tareas para su realización teniendo en cuenta las dependencias encontradas y la optimización de tu ventana de contexto.
3. Espera que valide el plan general.
4. Para cada tarea:
4.1. Planifica la tarea
4.2 Espera confirmación del plan.
4.3 Ejecuta los cambios y realiza los tests correspondientes.
4.4. Comprueba que funcionan los tests e itera hasta que pasen.