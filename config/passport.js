const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

module.exports = function(passport){
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback';

  // Validate required env vars early to provide clearer errors
  if (!clientID || !clientSecret) {
    const msg = 'Missing Google OAuth credentials: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment';
    console.error(msg);
    throw new Error(msg);
  }

  if (!callbackURL) {
    const msg = 'Missing GOOGLE_CALLBACK_URL environment variable';
    console.error(msg);
    throw new Error(msg);
  }

  passport.use(new GoogleStrategy({ clientID, clientSecret, callbackURL, passReqToCallback: true },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] && profile.emails[0].value ? profile.emails[0].value.toLowerCase() : null;
        if (!email) return done(new Error('No email in Google profile'));

        // try to find by googleId first
        let user = await User.findOne({ googleId: profile.id }).lean();
        if (!user) {
          // try by email
          user = await User.findOne({ email });
        }

        if (user && !user.googleId) {
          // attach googleId if missing
          user.googleId = profile.id;
          await user.save();
        }

        if (!user) {
            // create a new user
            const newUser = new User({
              name: profile.displayName || (email ? email.split('@')[0] : 'User'),
              email,
              username: email,
              googleId: profile.id,
              isVerified: true,
              role: 'student'
            });
          await newUser.save();
          return done(null, newUser);
        }

        return done(null, user);
      } catch (err) {
        console.error('GoogleStrategy error:', err);
        return done(err);
      }
    }
  ));

  passport.serializeUser((user, done) => done(null, user._id || user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const u = await User.findById(id).lean();
      done(null, u);
    } catch (err) { done(err); }
  });
};
