// Authentication Module
// Handles Google OAuth authentication, session management, and route protection

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');

class AuthenticationManager {
  constructor() {
    this.isAuthenticated = false;
    this.setupPassport();
    this.setupSession();
  }

  /**
   * Validate required authentication environment variables
   */
  validateEnvironment() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, GOOGLE_HOSTED_DOMAIN } = process.env;
    
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET) {
      console.error(
        'Error: Debes definir GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y SESSION_SECRET en el archivo .env',
      );
      process.exit(1);
    }

    return {
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      SESSION_SECRET,
      GOOGLE_HOSTED_DOMAIN
    };
  }

  /**
   * Setup Express session middleware
   */
  setupSession() {
    const { SESSION_SECRET } = this.validateEnvironment();
    
    this.sessionMiddleware = session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24 horas
    });
  }

  /**
   * Setup Passport.js with Google OAuth strategy
   */
  setupPassport() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_HOSTED_DOMAIN } = this.validateEnvironment();

    passport.use(
      new GoogleStrategy(
        {
          clientID: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          callbackURL: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/auth/google/callback`,
          hd: GOOGLE_HOSTED_DOMAIN,
        },
        this.handleGoogleCallback.bind(this)
      ),
    );

    passport.serializeUser((user, done) => {
      done(null, user);
    });

    passport.deserializeUser((obj, done) => {
      done(null, obj);
    });

    this.passport = passport;
  }

  /**
   * Handle Google OAuth callback
   */
  handleGoogleCallback(accessToken, refreshToken, profile, done) {
    const { GOOGLE_HOSTED_DOMAIN } = this.validateEnvironment();
    
    // En este punto, el perfil de Google ha sido verificado.
    // Puedes buscar en tu base de datos si el usuario existe, o crearlo.
    // Por ahora, simplemente pasamos el perfil.
    // Asegúrate de que el usuario pertenece al dominio correcto si `hd` no es suficiente.
    if (GOOGLE_HOSTED_DOMAIN && profile._json.hd !== GOOGLE_HOSTED_DOMAIN) {
      return done(new Error('Dominio de Google no autorizado'));
    }
    return done(null, profile);
  }

  /**
   * Middleware to protect routes
   */
  ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ error: 'No autenticado' });
  }

  /**
   * Get current user information
   */
  getCurrentUser(req) {
    if (req.isAuthenticated()) {
      return {
        name: req.user.displayName,
        email: req.user.emails[0].value,
        photo: req.user.photos[0].value,
      };
    }
    return null;
  }

  /**
   * Setup authentication routes
   */
  setupRoutes(app) {
    // Google authentication route
    app.get(
      '/auth/google',
      this.passport.authenticate('google', { scope: ['profile', 'email'] }),
    );

    // Google callback route
    app.get(
      '/auth/google/callback',
      this.passport.authenticate('google', { failureRedirect: '/' }),
      (req, res) => {
        // Redirección exitosa a la página principal.
        res.redirect('/');
      },
    );

    // Logout route
    app.get('/auth/logout', (req, res, next) => {
      req.logout(function (err) {
        if (err) {
          return next(err);
        }
        res.redirect('/');
      });
    });

    // Current user route (must be before authentication middleware)
    app.get('/api/current-user', (req, res) => {
      const currentUser = this.getCurrentUser(req);
      res.json(currentUser);
    });
  }

  /**
   * Apply authentication middleware to Express app
   */
  applyMiddleware(app) {
    // Apply session middleware
    app.use(this.sessionMiddleware);

    // Initialize Passport
    app.use(this.passport.initialize());
    app.use(this.passport.session());

    // Setup authentication routes
    this.setupRoutes(app);

    // Protect all /api routes (except those defined before)
    app.use('/api', this.ensureAuthenticated.bind(this));
  }

  /**
   * Get session middleware
   */
  getSessionMiddleware() {
    return this.sessionMiddleware;
  }

  /**
   * Get Passport instance
   */
  getPassport() {
    return this.passport;
  }

  /**
   * Get authentication middleware
   */
  getAuthMiddleware() {
    return this.ensureAuthenticated.bind(this);
  }
}

module.exports = AuthenticationManager;