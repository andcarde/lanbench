Let's add a new user story to the project. The user story is to register a moderator user.

# Description (user story and technical details)
In the register page, there will be a "Moderator" checkbox (default: disabled) which, when active, will show a new field to write: 'Moderator Register Code', which would be a letter-and-number combination of exactly 16 characters in length (if moderator is checked and the length is less than 16, it will show an error). The code will not allow writing or pasting more than 16 characters. This code will arrive at the server at `POST /register/moderator` with the same user information, plus the register code (reuse the user logic when the code has been validated). There will be a new table in the schema, `register_codes`, that will have only two columns: the creation date and the code itself (VARCHAR(16)), the latter being the primary key. When registering, it will check if the given code exists in the database. If it does, the code will be deleted from the database and the registration with the moderator role will occur. If the code is not present, an error message will be returned.

# Plan
I give you the tasks, but you have to plan (according to CLAUDE.md) for each task, creating the subtasks: how to make this change, which modules, packages, and files will be modified, and the best way to mitigate the risk of failing. I put some subtasks in order to guide you, but you are free to divide and detail them. Plan only the immediate task, not the next one. Tasks in order:

## Task 0 (no planning needed)
0. Ask me about every imprecise aspect in the functionality.

## Task 1. Documentation
1.0 Planning (I have to validate the plan).
1.1 Before implementation comes documentation. Adapt `user_stories.md` with the new user story.
1.2 Update `technical_design.md` as well. It is important to follow the next order during development:

## Task 2. Implementation of the code generator
2.0 Planning (I have to validate the plan).
2.1 Generate a script that asks the user for the number of codes to be generated, tries to generate the keys; if it fails, it prints the error, otherwise it prints the keys, each one on its own line.
2.2 Write a unit test for the script. Test and modify in a loop until it passes.

## Task 3. Implementation of the back end
3.0 Planning (I have to validate the plan).
3.1 Make the back-end changes (router, controllers, services) and test them.
3.2 Write unit tests.
3.3 Write an integration test with a `POST /register/moderator` request. In the integration test, you have to use the code generator to obtain a code that will be used to register a moderator user.
3.4 Iterate on the code until all tests pass.

## Task 4. Implementation of the front end
4.0 Planning (I have to validate the plan).
4.1 I remind you that every AJAX request is separated from the rest of the JS files (`public/js/actions/register-actions.js`). Create a file to fulfill the request.
4.2 Make the necessary changes in `register.html` with the new elements.
4.3 Update the style if necessary (`register.css`).
4.4 Set the validation logic in `register.js` (`code.length == 16`, only numbers and letters). Add the limits for writing and pasting more than 16 characters. When hiding the moderator checkbox, the content of the field must be cleared.

## Task 5. System test
5. Let me know when everything is finished. I will personally test the system and notify you if something is wrong.
