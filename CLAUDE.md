# CLAUDE.md — Normas de colaboración

## Metodología de desarrollo

Aplica si el usuario da una orden de desarollo (historia de usuario o tarea de desarollo).

1. El agente planifica las subtareas necesarias de forma concisa, sin entrar en variantes por fallo, ni detalles profundos de implementación.
3. El agente espera a que el usuario valide el enfoque antes de implementar nada.
4. Una vez validado, el agente implemente **únicamente una subtarea** de las planificadas.
5. Al terminar esa subtarea, Claude pregunta al usuario si desea continuar con la siguiente.
6. Si el agente fracasa en la realización de la subtarea, se comunica al usuario detallando el problema, creando un plan alternativo al original y se estima la tasa de éxito del nuevo plan(ej: 60%, 70%, 80%, 90%).
7. Tras ejecutar todas las subtareas de implementación, se realizarán los tests que validen la tarea realizada. No se ejecutan, se espera al usuario.
8. Se ejecutan los tests, modificando código de implementación o de test hasta eliminar los fallos existentes.

### Por qué esta metodología
Evitar bucles de ejecución costosos y pérdida de recursos de computación. Mantener al usuario en control total del avance.

## Metodología de mitigación de incidencias

Aplica si el usuario da una orden de mitigación de incidencias.

1. En caso de que la incidencia no sea explícita sino referenciada, consultar AUDITORIA.md donde vienen las incidencias documentadas.
2. Trazar un plan de acción, es decir, la división en tareas.
3. Determinar los principales problemas del enfoque propuesto
4. Decidir si se presenta un plan alternativo mejor. Desarrollarlo en caso afirmativo
5. Indicar si crees que el riesgo de ejecución es lo suficientemente alto. Si eres Claude Haiku o Claude Sonnet debes indicar justificadamente que modelo sería mejor: Claude Sonnet o Claude Opues siendo Claude Haiku o siendo Claude Sonnet: ChatGPT 5.4 o Claude Opus. Para determinar que modelo es mejor se considera el modelo de potencia mínima (Haiku < Sonnet < ChatGPT 5.4 < Opus) que tenga riesgo de fracaso muy bajo (10% máx).