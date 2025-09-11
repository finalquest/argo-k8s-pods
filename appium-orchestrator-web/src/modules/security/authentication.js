// Authentication Module
// Handles Google OAuth authentication, session management, and route protection

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');

class AuthenticationManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.isAuthenticated = configManager.isEnabled('authentication');
    this.setupSession();
    this.setupPassport();
  }

  /**
   * Setup Express session middleware
   */
  setupSession() {
    const sessionConfig = this.configManager.getSessionConfig();

    this.sessionMiddleware = session(sessionConfig);
  }

  /**
   * Setup Passport.js with Google OAuth strategy (only if authentication is enabled)
   */
  setupPassport() {
    if (this.configManager.isEnabled('authentication')) {
      const oauthConfig = this.configManager.getOAuthConfig();

      passport.use(
        new GoogleStrategy(
          {
            clientID: oauthConfig.clientID,
            clientSecret: oauthConfig.clientSecret,
            callbackURL: oauthConfig.callbackURL,
            hostedDomain: oauthConfig.hostedDomain,
          },
          this.handleGoogleCallback.bind(this),
        ),
      );

      passport.serializeUser((user, done) => {
        done(null, user);
      });

      passport.deserializeUser((obj, done) => {
        done(null, obj);
      });

      this.passport = passport;
    } else {
      // Development mode - no authentication
      this.passport = null;
    }
  }

  /**
   * Handle Google OAuth callback
   */
  handleGoogleCallback(accessToken, refreshToken, profile, done) {
    const oauthConfig = this.configManager.getOAuthConfig();

    // En este punto, el perfil de Google ha sido verificado.
    // Puedes buscar en tu base de datos si el usuario existe, o crearlo.
    // Por ahora, simplemente pasamos el perfil.
    // Asegúrate de que el usuario pertenece al dominio correcto si `hd` no es suficiente.
    if (oauthConfig.hostedDomain && profile._json.hd !== oauthConfig.hostedDomain) {
      return done(new Error('Dominio de Google no autorizado'));
    }
    return done(null, profile);
  }

  /**
   * Middleware to protect routes
   */
  ensureAuthenticated(req, res, next) {
    if (!this.configManager.isEnabled('authentication')) {
      // Development mode - allow access
      return next();
    }

    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ error: 'No autenticado' });
  }

  /**
   * Get current user information
   */
  getCurrentUser(req) {
    if (!this.configManager.isEnabled('authentication')) {
      // Development mode - return development user
      return this.configManager.getDevelopmentUser();
    }

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
    if (this.configManager.isEnabled('authentication')) {
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
    } else {
      // Development mode - provide mock auth routes
      app.get('/auth/logout', (req, res) => {
        res.redirect('/');
      });
    }

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

    // Initialize Passport only if authentication is enabled
    if (this.configManager.isEnabled('authentication')) {
      app.use(this.passport.initialize());
      app.use(this.passport.session());
    }

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

  /**
   * Check if authentication is enabled
   */
  isAuthenticationEnabled() {
    return this.configManager.isEnabled('authentication');
  }

  /**
   * Check if running in development mode
   */
  isDevelopmentMode() {
    return this.configManager.isDevelopmentMode();
  }

  /**
   * Get authentication status for client
   */
  getAuthStatus() {
    return {
      enabled: this.isAuthenticationEnabled(),
      developmentMode: this.isDevelopmentMode(),
      providers: this.isAuthenticationEnabled() ? ['google'] : [],
      domainRestriction: this.configManager.isEnabled('domainRestriction'),
    };
  }
}

module.exports = AuthenticationManager;
