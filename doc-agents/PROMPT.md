# General orders

1. Code review: You will review a specific file in order to locate
software antipatterns. Syntax errors.

2. Documentation: For each function of the given code file. You will create a professional comment in which you will determine what the function is for, what the preconditions are, in particular, what the input variables symbolize and what data types they are. The same for the output variable. Good comments don't just tell information, but domain information that is useful to know the why of the function.

3. Name improvement: Using descriptive, unambiguous names is essential for the maintenance of an application. This task involves asking whether each variable, function, or class has an appropriate name and changing it if a better one is found.

4. Elimination of duplicated code. Duplicated code will be detected in a file and proceed to be removed. To this end, it is useful to create new functions that incorporate the common behavior or classes when said behavior is tied to data structures that will act as class attributes.

5. Test generation. From a development file, a test file will be created that will validate that the functions and classes defined in the first one work. To generate valid tests, branch coverage must be achieved, one test per branch in a function. When a test is created, even if we don't base it on the structure of the original function, we must treat it as a black box as much as possible, even if it is necessary to mock the response of functions that are not in the file.

6. Task: Software architecture analysis.

The goal is to eliminate structural problems in a software project. To do this, this task is established to achieve the sub-goal of analyzing the architecture of that software project, comparing it with industry standards, and detecting structural problems, paying attention to cohesion and coupling.

First, identify the type of architecture of the system (for example: monolithic, layered, hexagonal, microservices, or other). Evaluate the level of cohesion of the components and the level of coupling between modules and functions. Compare the observed architecture with industry best practices, such as separation of responsibilities, modularity, and SOLID principles, and indicate the relevant deviations.

Second, detect problems in the code and classify them into one of the following categories. Incoherence: inconsistent use of approaches, data, or libraries without justification. Redundancy: duplicated or unused code. Coupling: excessive dependencies between components or poorly separated responsibilities. Contract: inconsistencies between the expected preconditions of a function and its actual use in calls. Others: any problem not covered by the previous categories, indicating its type.

Third, generate a table with the detected problems. The table must include three columns: type of problem, scope (method, class, file, package, or general), and description of the problem.

Fourth, for each identified problem, assign a resolution complexity level among the following values: minimal, low, medium, high, very high, or critical.

Fifth, select the lowest-capability model that can carry out this task with an estimated success rate of at least 95% among the following options: Claude Haiku Thinking, Claude Sonnet 4.6 Medium, Claude Sonnet 4.6 High, Claude Opus 4.7 Medium, Claude Opus 4.7 High, and ChatGPT 5.4. Do it based on the problem: type and complexity level previously determined; and based on the model: reasoning capacity and context volume.

Finally, write the audit performed in a new file AUDITORIA-n.md where n is the audit number. If no AUDITORIA-n.md exists, you will set n=1. If it exists, this n will be the next one after the previous.

6.1 Case: Good plan

I consider the plan to be correct and that the prompt is very complete, so you will execute all the steps of the defined task without interruption.

7. Goal: Feature coverage analysis.

Check whether the features defined in the user stories are covered or not. Analyze coverage first by user story, second by feature, and third by layers (front, handlers, routers, controllers, integration, ...).

Write the audit performed in a new file US-COBERTURA-n.md where n is the audit number. If no US-COBERTURA-n.md exists, you will set n=1. If this file exists, n will be the next one after the previous.

8. Software vulnerability analysis. It will be verified that there are no code vulnerabilities. If any exists, it will be identified by its official name (CVE) and by its importance (mild, moderate, severe, critical).

9. The goal is to remediate the problems detected in AUDITORIA-2.md. To do this, resolve the problems that have not been assigned to Claude Haiku in "2. Table of detected problems".

ChatGPT 5.4 has been working on these same tasks. Therefore, you must find out which ones have been done in order to skip them and which ones are halfway through in order to perform a prior analysis of the approach.

Follow the steps:
1. Detect the dependencies between tasks.
2. Generate a general plan in which tasks are ordered for execution taking into account the dependencies found and the optimization of your context window.
3. Wait for me to validate the general plan.
4. For each task:
4.1. Plan the task
4.2 Wait for plan confirmation.
4.3 Execute the changes and run the corresponding tests.
4.4. Check that the tests pass and iterate until they do.
