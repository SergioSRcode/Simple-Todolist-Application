/* eslint-disable max-lines-per-function */
/* eslint-disable no-unused-vars */
const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const TodoList = require("./lib/todolist");
const Todo = require("./lib/todo");
const { sortTodoLists, sortTodos } = require("./lib/sort");
const store = require("connect-loki");

const app = express();
const host = "localhost";
const port = 3000;
const LokiStore = store(session);

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000, // 31 days in millseconds
    path: "/",
    secure: false,
  },
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  store: new LokiStore({}),
}));
app.use(flash());

// Set up persistent session data
app.use((req, res, next) => {
  let todoLists = [];
  if ("todoLists" in req.session) {
    req.session.todoLists.forEach(todoList => {
      todoLists.push(TodoList.makeTodoList(todoList));
    });
  }

  req.session.todoLists = todoLists;
  next();
});

// Extract session info
app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

// Find a todo list with the indicated ID. Returns `undefined` if not found.
// Note that `todoListId` must be numeric.
const loadTodoList = (todoListId, todoLists) => {
  return todoLists.find(todoList => todoList.id === todoListId);
};

// Find todo with indicated ID in the indicated todo list. Returns 'undefined'
// if not found. "todoList" is an obj, 'todoId' must be numeric.
const loadTodo = (todoList, todoId) => {
  if (!todoList) return undefined;

  return todoList.todos.find(todo => todo.id === todoId);
};

// Redirect start page
app.get("/", (req, res) => {
  res.redirect("/lists");
});

// Render the list of todo lists
app.get("/lists", (req, res) => {
  res.render("lists", {
    todoLists: sortTodoLists(req.session.todoLists),
  });
});

app.get("/lists/new", (req, res) => {
  res.render("new-list");
});

// Create a new todo list
app.post("/lists",
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The list title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters.")
      // preventing duplicate entries
      .custom((title, { req }) => {
        let todoLists = req.session.todoLists;
        let duplicate = todoLists.find(list => list.title === title);
        return duplicate === undefined;
      })
      .withMessage("List title must be unique."),
  ],
  (req, res) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(err => req.flash("error", err.msg));
      res.render("new-list", {
        flash: req.flash(),
        todoListTitle: req.body.todoListTitle,
      });
    } else {
      req.session.todoLists.push(new TodoList(req.body.todoListTitle));
      req.flash("success", "The todo list has been created.");
      res.redirect("/lists");
    }
  }
);

// Render individual todo list and its todos
app.get("/lists/:todoListId", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);

  if (todoList === undefined) {
    next(new Error("Not found."));
  } else {
    res.render("list", {
      todoList: todoList,
      todos: sortTodos(todoList),
    });
  }
});

// Toggle completion status of a todo
app.post(`/lists/:todoListId/todos/:todoId/toggle`, (req, res, next) => {
  let { todoListId, todoId } = { ...req.params };
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  let todo = loadTodo(todoList, +todoId, req.session.todoLists);

  if (!todo) {
    next(new Error("Not found."));
  } else if (todo.isDone()) {
    todo.markUndone();
    req.flash("success", `Completion for "${todo.title}" undone`);
  } else {
    todo.markDone();
    req.flash("success", "Todo completet!");
    if (todoList.isDone()) req.flash("success", "Congrats, all tasks done!");
  }

  res.redirect(`/lists/${todoListId}`);
});

// Permanently delete a Todo
app.post(`/lists/:todoListId/todos/:todoId/destroy`, (req, res, next) => {
  let { todoListId, todoId } = { ...req.params };
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  let todo = loadTodo(todoList, +todoId, req.session.todoLists);
  let idxOfTodo = todoList.findIndexOf(todo);

  if (!todo || !todoList) {
    next(new Error("Not found."));
  } else {
    todoList.removeAt(idxOfTodo);
    req.flash("success", `Todo has been deleted.`);
    res.redirect(`/lists/${todoListId}`);
  }
});

// Set all Todos to completed
app.post(`/lists/:todoListId/complete_all`, (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);

  if (!todoList) {
    next(new Error("Not found."));
  } else {
    todoList.markAllDone();
    req.flash("success", "All Todos were marked as done!");
    res.redirect(`/lists/${todoListId}`);
  }
});

// Create a new todo and add it to the specified list
app.post("/lists/:todoListId/todos",
  [
    body("todoTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The todo title is required.")
      .isLength({ max: 100 })
      .withMessage("Todo title must be between 1 and 100 characters."),
  ],
  (req, res, next) => {
    let todoListId = req.params.todoListId;
    let todoList = loadTodoList(+todoListId, req.session.todoLists);
    if (!todoList) {
      next(new Error("Not found."));
    } else {
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash("error", message.msg));

        res.render("list", {
          flash: req.flash(),
          todoList: todoList,
          todos: sortTodos(todoList),
          todoTitle: req.body.todoTitle,
        });
      } else {
        let todo = new Todo(req.body.todoTitle);
        todoList.add(todo);
        req.flash("success", "The todo has been created.");
        res.redirect(`/lists/${todoListId}`);
      }
    }
  }
);

// Render edit todo list form
app.get(`/lists/:todoListId/edit`, (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);

  if (!todoList) next(new Error("Not found."));
  res.render("edit-list", { todoList });
});

// Delete todolist
app.post(`/lists/:todoListId/destroy`, (req, res, next) => {
  let todoLists = req.session.todoLists;
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  let idxOfTodoList = todoLists.findIndex(list => list === todoList);

  if (idxOfTodoList === -1) {
    next(new Error("Not found."));
  } else {
    todoLists.splice(idxOfTodoList, 1);
    req.flash("success", `Todolist has been deleted.`);
    res.redirect(`/lists`);
  }
});

// Edit todolist titles
app.post(`/lists/:todoListId/edit`, [
  body("todoListTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The list title is required.")
    .isLength({ max: 100 })
    .withMessage("List title must be between 1 and 100 characters.")
    // preventing duplicate entries
    .custom((title, { req }) => {
      let todoLists = req.session.todoLists;
      let duplicate = todoLists.find(list => list.title === title);
      return duplicate === undefined;
    })
    .withMessage("List title must be unique."),
],
(req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  let newTitle = req.body.todoListTitle;

  if (!todoList) next(new Error("Not found."));

  let errors = validationResult(req);
  if (!errors.isEmpty()) {
    errors.array().forEach(err => req.flash("error", err.msg));

    res.render("edit-list", {
      flash: req.flash(),
      todoListTitle: req.body.todoListTitle,
      todoList,
    });
  } else {
    todoList.setTitle(newTitle);
    req.flash("success", "Name of todolist has been updated.");
    res.redirect(`/lists/${todoListId}`);
  }
});

// Error handler
app.use((err, req, res, _next) => {
  console.log(err); // Writes more extensive information to the console log
  res.status(404).send(err.message);
});

// Listener
app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
});
