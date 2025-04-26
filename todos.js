/* eslint-disable max-lines-per-function */
/* eslint-disable no-unused-vars */
const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const TodoList = require("./lib/todolist");

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
// Compare todo list titles alphabetically
const compareByTitle = (todoListA, todoListB) => {
  let titleA = todoListA.title.toLowerCase();
  let titleB = todoListB.title.toLowerCase();

  if (titleA < titleB) {
    return -1;
  } else if (titleA > titleB) {
    return 1;
  } else {
    return 0;
  }
};

// return the list of todo lists sorted by completion status and title.
const sortTodoLists = lists => {
  let undone = lists.filter(todoList => !todoList.isDone());
  let done   = lists.filter(todoList => todoList.isDone());

  undone.sort(compareByTitle);
  done.sort(compareByTitle);

  return [].concat(undone, done);
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

// Listener
app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
});