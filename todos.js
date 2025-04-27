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

const app = express();
const host = "localhost";
const port = 3000;

// Static data for initial testing
let todoLists = require("./lib/seed-data");

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not secure",
}));
app.use(flash());
// Extract session info
app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

// Find a todo list with the indicated ID. Returns `undefined` if not found.
// Note that `todoListId` must be numeric.
const loadTodoList = todoListId => {
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
    todoLists: sortTodoLists(todoLists),
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
      .custom(title => {
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
      todoLists.push(new TodoList(req.body.todoListTitle));
      req.flash("success", "The todo list has been created.");
      res.redirect("/lists");
    }
  }
);

// Render individual todo list and its todos
app.get("/lists/:todoListId", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId);

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
  let todoList = loadTodoList(+todoListId);
  let todo = loadTodo(todoList, +todoId);

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

// Permanently delete Todos
app.post(`/lists/:todoListId/todos/:todoId/destroy`, (req, res, next) => {
  let { todoListId, todoId } = { ...req.params };
  let todoList = loadTodoList(+todoListId);
  let todo = loadTodo(todoList, +todoId);
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
  let todoList = loadTodoList(+todoListId);

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
    let todoList = loadTodoList(+todoListId);
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

// Error handler
app.use((err, req, res, _next) => {
  console.log(err); // Writes more extensive information to the console log
  res.status(404).send(err.message);
});

// Listener
app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
});
