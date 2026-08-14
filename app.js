const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
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
app.use(cookieParser(process.env.SESSION_SECRET || 'unihub_secret'));
app.use(express.static(path.join(__dirname, 'public')));

// Session Configuration
// app.use(
//   session({
//     secret: process.env.SESSION_SECRET || 'unihub_secret_key',
//     resave: false,
//     saveUninitialized: false,
//     store: typeof MongoStore.create === 'function' 
//       ? MongoStore.create({ mongoUrl: process.env.MONGODB_URI, collectionName: 'sessions' })
//       : new MongoStore({ mongooseConnection: mongoose.connection, collection: 'sessions' }),
//     cookie: {
//       maxAge: 1000 * 60 * 60 * 24, // 1 day
//     },
//   })
// );
// MongoStore Options

const MongoStoreModule = MongoStore;
let store;
try {
  if (MongoStoreModule && typeof MongoStoreModule.create === 'function') {
    // connect-mongo v4+
    store = MongoStoreModule.create({
      mongoUrl: process.env.MONGODB_URI,
      touchAfter: 24 * 3600,
    });
  } else if (MongoStoreModule && MongoStoreModule.default && typeof MongoStoreModule.default.create === 'function') {
    // ESM default export interop
    store = MongoStoreModule.default.create({
      mongoUrl: process.env.MONGODB_URI,
      touchAfter: 24 * 3600,
    });
  } else if (typeof MongoStoreModule === 'function') {
    // connect-mongo v3 style: require('connect-mongo')(session)
    try {
      const factory = MongoStoreModule(session);
      store = factory({ mongooseConnection: mongoose.connection });
    } catch (err) {
      // try constructor/class fallback
      store = new MongoStoreModule({ mongoUrl: process.env.MONGODB_URI });
    }
  }
} catch (err) {
  console.error('Error creating Mongo session store:', err);
}

if (!store) {
  console.warn('Warning: could not create Mongo session store; sessions may not persist.');
}

if (store && typeof store.on === 'function') {
  store.on('error', (err) => {
    console.log('Error in MONGO SESSION STORE!', err);
  });
}

// Cookie / Session Options
const sessionOptions = {
  store,
  secret: process.env.SESSION_SECRET || 'unihub_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};

// Apply session middleware so `req.session` is available
app.use(session(sessionOptions));

// Global Variables Middleware
app.use((req, res, next) => {
  res.locals.currentUser = req.session ? req.session.user || null : null;
  next();
});

// Passport (for Google OAuth)
const passport = require('passport');
try{
  require('./config/passport')(passport);
  app.use(passport.initialize());
  app.use(passport.session());
}catch(e){ console.warn('Passport not configured:', e.message); }

// Routes
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

// When behind a proxy (Render), trust proxy so secure cookies and IPs work
if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
  app.set('trust proxy', 1);
  // ensure cookies are marked secure when using HTTPS
  if (sessionOptions && sessionOptions.cookie) sessionOptions.cookie.secure = true;
}

// Base Route Test
app.get('/', (req, res) => {
  res.render('index', { title: 'UniHub' });
});

const dashboardRoutes = require('./routes/dashboard');
app.use('/', dashboardRoutes);

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});