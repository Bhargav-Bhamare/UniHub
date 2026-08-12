const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
// const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();

// Database Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

// View Engine Setup

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body Parsers & Static Files
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(cookieParser(process.env.SESSION_SECRET || 'unihub_secret'));
app.use(express.static(path.join(__dirname, 'public')));

// Base Route Test
app.get('/', (req, res) => {
  res.send("Welcome to UniHub!");
});


// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});