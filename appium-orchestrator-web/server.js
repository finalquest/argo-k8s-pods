const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const simpleGit = require('simple-git');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { fork, exec, spawn } = require('child_process');
const fetch = require('node-fetch');
const https = require('https');
const archiver = require('archiver');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- Configuración de Autenticación ---
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, GOOGLE_HOSTED_DOMAIN } = process.env;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET) {
    console.error('Error: Debes definir GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y SESSION_SECRET en el archivo .env');
    process.exit(1);
}

const sessionMiddleware = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 horas
});

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.APP_BASE_URL}/auth/google/callback`,
    hd: GOOGLE_HOSTED_DOMAIN
  },
  (accessToken, refreshToken, profile, done) => {
    // En este punto, el perfil de Google ha sido verificado.
    // Puedes buscar en tu base de datos si el usuario existe, o crearlo.
    // Por ahora, simplemente pasamos el perfil.
    // Asegúrate de que el usuario pertenece al dominio correcto si `hd` no es suficiente.
    if (GOOGLE_HOSTED_DOMAIN && profile._json.hd !== GOOGLE_HOSTED_DOMAIN) {
        return done(new Error("Dominio de Google no autorizado"));
    }
    return done(null, profile);
  }
));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// Middleware para proteger rutas
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'No autenticado' });
}

// --- Rutas de Autenticación ---
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Redirección exitosa a la página principal.
    res.redirect('/');
  });

app.get('/auth/logout', (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

app.get('/api/current-user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            name: req.user.displayName,
            email: req.user.emails[0].value,
            photo: req.user.photos[0].value
        });
    } else {
        res.json(null);
    }
});

app.get('/api/config', (req, res) => {
    res.json({
        persistentWorkspacesEnabled: !!process.env.PERSISTENT_WORKSPACES_ROOT
    });
});

// Proteger todos los endpoints /api subsiguientes. /api/current-user está definido antes y permanece público.
app.use('/api', ensureAuthenticated);

app.get('/api/local-devices', (req, res) => {
    if (process.env.DEVICE_SOURCE !== 'local') {
        // Si no estamos en modo local, devolvemos una lista vacía.
        // El frontend usará esto como señal para no mostrar el dropdown de dispositivos.
        return res.json([]);
    }

    exec('adb devices', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al ejecutar "adb devices": ${error.message}`);
            return res.status(500).json({ error: 'No se pudo ejecutar el comando ADB. Asegúrate de que esté instalado y en el PATH.' });
        }

        const devices = stdout.split('\n')
            .slice(1)
            .map(line => line.split('\t'))
            .filter(parts => parts.length === 2 && parts[1] === 'device')
            .map(parts => parts[0]);

        res.json(devices);
    });
});

app.get('/api/local-devices', (req, res) => {
    if (process.env.DEVICE_SOURCE !== 'local') {
        return res.json([]);
    }

    exec('adb devices', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al ejecutar "adb devices": ${error.message}`);
            return res.status(500).json({ error: 'No se pudo ejecutar el comando ADB. Asegúrate de que esté instalado y en el PATH.' });
        }

        const devices = stdout.split('\n')
            .slice(1)
            .map(line => line.split('\t'))
            .filter(parts => parts.length === 2 && parts[1] === 'device')
            .map(parts => parts[0]);

        res.json(devices);
    });
});


const { GIT_REPO_URL, GIT_USER, GIT_PAT } = process.env;
if (!GIT_REPO_URL || !GIT_USER || !GIT_PAT) {
    console.error('Error: Debes definir GIT_REPO_URL, GIT_USER y GIT_PAT en el archivo .env');
    process.exit(1);
}

const getAuthenticatedUrl = () => {
    try {
        const url = new URL(GIT_REPO_URL);
        url.username = GIT_USER;
        url.password = GIT_PAT;
        return url.toString();
    } catch (error) {
        console.error('La GIT_REPO_URL no es una URL válida.');
        process.exit(1);
    }
};

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- Endpoints de la API ---

app.get('/api/branches', async (req, res) => {
  try {
    const git = simpleGit();
    const authenticatedUrl = getAuthenticatedUrl();
    const remoteInfo = await git.listRemote(['--heads', authenticatedUrl]);
    if (!remoteInfo) {
        return res.status(500).json({ error: 'No se pudo obtener información del repositorio.' });
    }
    const branches = remoteInfo.split('\n').filter(Boolean).map(line => {
        const parts = line.split('/');
        return parts[parts.length - 1];
    });
    res.json(branches);
  } catch (error) {
    console.error('Error al listar branches:', error);
    res.status(500).json({ error: 'Error interno al listar branches. Revisa la URL del repo y el PAT.' });
  }
});

app.get('/api/apk/versions', (req, res) => {
    // Modo 1: Directorio Local de APKs
    if (process.env.LOCAL_APK_DIRECTORY) {
        const apkDir = process.env.LOCAL_APK_DIRECTORY;
        if (!fs.existsSync(apkDir)) {
            console.error(`El directorio de APKs locales especificado no existe: ${apkDir}`);
            return res.status(500).json({ error: 'El directorio de APKs locales no existe.' });
        }
        try {
            const files = fs.readdirSync(apkDir);
            const apkFiles = files.filter(file => path.extname(file).toLowerCase() === '.apk');
            return res.json({ source: 'local', versions: apkFiles });
        } catch (error) {
            console.error(`Error al leer el directorio de APKs locales: ${error.message}`);
            return res.status(500).json({ error: 'Error al leer el directorio de APKs locales.' });
        }
    }

    // Modo 2: Registro ORAS (comportamiento anterior)
    const { repo } = req.query;
    if (!repo) {
        return res.status(400).json({ error: 'Se requiere el parámetro \'repo\'.' });
    }

    const sanitizedRepo = repo.replace(/[^a-zA-Z0-9_\-\/.]/g, '');
    if (sanitizedRepo !== repo) {
        return res.status(400).json({ error: 'Parámetro \'repo\' contiene caracteres inválidos.' });
    }

    const command = `oras repo tags harbor:8080/${sanitizedRepo} --plain-http`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al ejecutar oras: ${error.message}`);
            console.error(`Stderr: ${stderr}`);
            return res.status(500).json({ error: 'Error al obtener las versiones del APK.', details: stderr });
        }
        
        const versions = stdout.trim().split('\n').filter(Boolean);
        res.json({ source: 'registry', versions: versions });
    });
});

app.get('/api/features', async (req, res) => {
    const { branch, client } = req.query;
    if (!branch || !client) {
        return res.status(400).json({ error: 'Se requieren los parámetros \'branch\' y \'client\'.' });
    }

    // Lógica para leer features desde un workspace persistente si existe
    if (process.env.PERSISTENT_WORKSPACES_ROOT) {
        const sanitizedBranch = sanitize(branch);
        const workspacePath = path.join(process.env.PERSISTENT_WORKSPACES_ROOT, sanitizedBranch, 'appium');
        const featuresPath = path.join(workspacePath, 'test', 'features', client, 'feature');

        if (fs.existsSync(featuresPath)) {
            console.log(`[API Features] Leyendo features desde el workspace local para la branch: ${branch}`);
            try {
                const allEntries = await fs.promises.readdir(featuresPath, { withFileTypes: true });
                const featureFiles = allEntries
                    .filter(dirent => dirent.isFile() && dirent.name.endsWith('.feature'))
                    .map(dirent => dirent.name.replace(/\.feature$/, ''));
                return res.json(featureFiles);
            } catch (error) {
                console.error(`Error al leer features del workspace local para la branch '${branch}':`, error);
                // No devolver error, simplemente pasar al método de fallback (clonado remoto)
            }
        }
    }

    // Fallback: Si no hay workspace persistente o falla la lectura, clonar remotamente
    console.log(`[API Features] No se encontró workspace local para la branch ${branch}. Consultando repositorio remoto.`);
    const tmpDir = path.join(os.tmpdir(), `appium-features-${crypto.randomBytes(16).toString('hex')}`);
    const authenticatedUrl = getAuthenticatedUrl();
    try {
        await fs.promises.mkdir(tmpDir, { recursive: true });
        const git = simpleGit(tmpDir);
        await git.clone(authenticatedUrl, tmpDir, ['--branch', branch, '--depth', '1', '--no-checkout']);
        const featureDirForCheckout = path.join('test', 'features', client, 'feature');
        await git.checkout(branch, ['--', featureDirForCheckout]);
        const featuresPath = path.join(tmpDir, featureDirForCheckout);
        if (!fs.existsSync(featuresPath)) {
            return res.json([]);
        }
        const allEntries = await fs.promises.readdir(featuresPath, { withFileTypes: true });
        const featureFiles = allEntries
            .filter(dirent => dirent.isFile() && dirent.name.endsWith('.feature'))
            .map(dirent => dirent.name.replace(/\.feature$/, ''));
        res.json(featureFiles);
    } catch (error) {
        console.error(`Error al listar features para la branch '${branch}':`, error);
        res.status(500).json({ error: 'Error interno al listar features.' });
    } finally {
        if (fs.existsSync(tmpDir)) {
            await fs.promises.rm(tmpDir, { recursive: true, force: true });
        }
    }
});

app.get('/api/history/branches', (req, res) => {
    const reportsDir = path.join(__dirname, 'public', 'reports');
    if (!fs.existsSync(reportsDir)) {
        return res.json([]);
    }
    try {
        const branches = fs.readdirSync(reportsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        res.json(branches);
    } catch (error) {
        console.error('Error al leer las branches del historial:', error);
        res.status(500).json({ error: 'Error interno al leer las branches del historial.' });
    }
});

app.get('/api/history', (req, res) => {
    const { branch: branchFilter } = req.query;
    const reportsDir = path.join(__dirname, 'public', 'reports');
    if (!fs.existsSync(reportsDir)) {
        return res.json([]);
    }

    try {
        const history = [];
        const branches = fs.readdirSync(reportsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const branch of branches) {
            if (branchFilter && branch !== branchFilter) {
                continue;
            }
            const branchPath = path.join(reportsDir, branch);
            const features = fs.readdirSync(branchPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            for (const feature of features) {
                const featurePath = path.join(branchPath, feature);
                const timestamps = fs.readdirSync(featurePath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                for (const timestamp of timestamps) {
                    history.push({
                        branch: branch,
                        feature: feature,
                        timestamp: timestamp,
                        reportUrl: `/reports/${branch}/${feature}/${timestamp}/`
                    });
                }
            }
        }
        history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        res.json(history);
    } catch (error) {
        console.error('Error al leer el historial de reportes:', error);
        res.status(500).json({ error: 'Error interno al leer el historial.' });
    }
});

app.get('/api/workspace-status/:branch', (req, res) => {
    const { branch } = req.params;
    if (!process.env.PERSISTENT_WORKSPACES_ROOT) {
        return res.status(404).json({ error: 'La funcionalidad de workspaces persistentes no está habilitada.' });
    }

    const sanitizedBranch = sanitize(branch);
    const workspacePath = path.join(process.env.PERSISTENT_WORKSPACES_ROOT, sanitizedBranch, 'appium');

    if (!fs.existsSync(workspacePath)) {
        return res.json({ modified_features: [] }); // No hay workspace, no hay cambios
    }

    const command = `git -C ${workspacePath} diff --name-only HEAD`;
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al ejecutar git diff para la branch ${branch}:`, stderr);
            return res.status(500).json({ error: 'Error al comprobar el estado del workspace.', details: stderr });
        }

        const modifiedFiles = stdout.trim().split('\n').filter(Boolean);
        const modifiedFeatures = modifiedFiles.filter(file => file.includes('/feature/') && file.endsWith('.feature'));
        
        res.json({ modified_features: modifiedFeatures });
    });
});

app.get('/api/feature-content', async (req, res) => {
    const { branch, client, feature } = req.query;
    if (!branch || !client || !feature) {
        return res.status(400).json({ error: 'Se requieren los parámetros branch, client y feature.' });
    }
    if (!process.env.PERSISTENT_WORKSPACES_ROOT) {
        return res.status(404).json({ error: 'La funcionalidad de workspaces persistentes no está habilitada.' });
    }

    const sanitizedBranch = sanitize(branch);
    const workspacePath = path.join(process.env.PERSISTENT_WORKSPACES_ROOT, sanitizedBranch, 'appium');
    const featurePath = path.join(workspacePath, 'test', 'features', client, 'feature', feature);

    // Security check
    const resolvedPath = path.resolve(featurePath);
    if (!resolvedPath.startsWith(path.resolve(workspacePath))) {
        return res.status(403).json({ error: 'Acceso a archivo no autorizado.' });
    }

    try {
        const content = await fs.promises.readFile(featurePath, 'utf-8');
        res.type('text/plain').send(content);
    } catch (error) {
        console.error(`Error al leer el archivo del feature ${feature}:`, error);
        res.status(500).json({ error: 'No se pudo leer el archivo del feature.' });
    }
});

app.post('/api/feature-content', async (req, res) => {
    const { branch, client, feature, content } = req.body;
    if (!branch || !client || !feature || content === undefined) {
        return res.status(400).json({ error: 'Faltan parámetros (branch, client, feature, content).' });
    }
    if (!process.env.PERSISTENT_WORKSPACES_ROOT) {
        return res.status(404).json({ error: 'La funcionalidad de workspaces persistentes no está habilitada.' });
    }

    const sanitizedBranch = sanitize(branch);
    const workspacePath = path.join(process.env.PERSISTENT_WORKSPACES_ROOT, sanitizedBranch, 'appium');
    const featurePath = path.join(workspacePath, 'test', 'features', client, 'feature', feature);

    // Security check
    const resolvedPath = path.resolve(featurePath);
    if (!resolvedPath.startsWith(path.resolve(workspacePath))) {
        return res.status(403).json({ error: 'Acceso a archivo no autorizado.' });
    }

    try {
        await fs.promises.writeFile(featurePath, content, 'utf-8');
        res.status(200).json({ message: 'Feature guardado con éxito.' });
    } catch (error) {
        console.error(`Error al guardar el archivo del feature ${feature}:`, error);
        res.status(500).json({ error: 'No se pudo guardar el archivo del feature.' });
    }
});


const httpsAgent = new https.Agent({ rejectUnauthorized: false });

app.get('/api/wiremock/mappings', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings`, { agent: httpsAgent });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching mappings from Wiremock:', error);
        res.status(500).json({ error: 'Error fetching mappings from Wiremock' });
    }
});

app.delete('/api/wiremock/mappings', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings`, { 
            method: 'DELETE',
            agent: httpsAgent 
        });
        res.status(response.status).send();
    } catch (error) {
        console.error('Error deleting mappings from Wiremock:', error);
        res.status(500).json({ error: 'Error deleting mappings from Wiremock' });
    }
});

app.post('/api/wiremock/mappings/reset', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings/reset`, { 
            method: 'POST',
            agent: httpsAgent 
        });
        res.status(response.status).send();
    } catch (error) {
        console.error('Error resetting mappings in Wiremock:', error);
        res.status(500).json({ error: 'Error resetting mappings in Wiremock' });
    }
});

app.post('/api/wiremock/mappings/import', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings/import`, { 
            method: 'POST',
            agent: httpsAgent,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        res.status(response.status).send();
    } catch (error) {
        console.error('Error importing mappings to Wiremock:', error);
        res.status(500).json({ error: 'Error importing mappings to Wiremock' });
    }
});

app.post('/api/wiremock/load-base-mappings', async (req, res) => {
    try {
        const baseMappingsPath = path.join(__dirname, 'public', 'js', 'base_mapping.json');
        if (!fs.existsSync(baseMappingsPath)) {
            return res.status(404).json({ error: 'base_mapping.json not found' });
        }
        const mappings = JSON.parse(fs.readFileSync(baseMappingsPath, 'utf8'));
        
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings/import`, { 
            method: 'POST',
            agent: httpsAgent,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mappings)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Wiremock import failed with status ${response.status}: ${errorBody}`);
        }

        res.status(200).json({ message: 'Base mappings loaded successfully' });
    } catch (error) {
        console.error('Error loading base mappings to Wiremock:', error);
        res.status(500).json({ error: 'Failed to load base mappings', details: error.message });
    }
});

app.get('/api/wiremock/requests', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/requests`, { agent: httpsAgent });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching requests from Wiremock:', error);
        res.status(500).json({ error: 'Error fetching requests from Wiremock' });
    }
});

app.delete('/api/wiremock/requests', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/requests`, { 
            method: 'DELETE',
            agent: httpsAgent 
        });
        res.status(response.status).send();
    } catch (error) {
        console.error('Error deleting requests from Wiremock:', error);
        res.status(500).json({ error: 'Error deleting requests from Wiremock' });
    }
});

app.post('/api/wiremock/recordings/start', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/recordings/start`, { 
            method: 'POST',
            agent: httpsAgent,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetBaseUrl: process.env.WIREMOCK_RECORDING_TARGET_URL })
        });
        res.status(response.status).send();
    } catch (error) {
        console.error('Error starting recording in Wiremock:', error);
        res.status(500).json({ error: 'Error starting recording in Wiremock' });
    }
});

function splitAndSaveMappings(mappings, recordingName) {
    const baseDir = process.env.WIREMOCK_MAPPINGS_DIR || './wiremock/mappings';
    const mappingsDir = path.join(baseDir, recordingName);

    if (!fs.existsSync(mappingsDir)) {
        fs.mkdirSync(mappingsDir, { recursive: true });
    }

    const groupedMappings = new Map();

    mappings.forEach(mapping => {
        const url = mapping.request.url;
        if (!url) return;

        const pathParts = url.split('?')[0].split('/').filter(Boolean);
        if (pathParts.length === 0) return;

        const dirPath = path.join(mappingsDir, ...pathParts.slice(0, -1));
        const fileName = `${pathParts[pathParts.length - 1] || 'index'}.json`;
        const filePath = path.join(dirPath, fileName);

        if (!groupedMappings.has(filePath)) {
            groupedMappings.set(filePath, []);
        }
        groupedMappings.get(filePath).push(mapping);
    });

    let filesCreated = 0;
    groupedMappings.forEach((mappings, filePath) => {
        const dirPath = path.dirname(filePath);
        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify({ mappings }, null, 2));
        filesCreated++;
    });

    return { totalMappings: mappings.length, filesCreated };
}

function saveMappingsAsSingleFile(mappings, recordingName) {
    const baseDir = process.env.WIREMOCK_MAPPINGS_DIR || './wiremock/mappings';
    const filePath = path.join(baseDir, `${recordingName}.json`);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ mappings }, null, 2));

    return { totalMappings: mappings.length, filesCreated: 1 };
}

app.post('/api/wiremock/recordings/stop', async (req, res) => {
    console.log('--- DEBUG: /api/wiremock/recordings/stop ---');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    try {
        const { recordingName, saveAsSingleFile } = req.body;
        if (!recordingName) {
            return res.status(400).json({ error: 'El nombre de la grabación es requerido.' });
        }

        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/recordings/stop`, { 
            method: 'POST',
            agent: httpsAgent 
        });
        const data = await response.json();

        const summary = saveAsSingleFile
            ? saveMappingsAsSingleFile(data.mappings, recordingName)
            : splitAndSaveMappings(data.mappings, recordingName);

        res.json({
            message: `Grabación '${recordingName}' finalizada y mappings guardados.`, 
            summary: summary
        });
    } catch (error) {
        console.error('Error stopping recording in Wiremock:', error);
        res.status(500).json({ error: 'Error stopping recording in Wiremock' });
    }
});

app.get('/api/wiremock/recordings/status', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/recordings/status`, { agent: httpsAgent });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching recording status from Wiremock:', error);
        res.status(500).json({ error: 'Error fetching recording status from Wiremock' });
    }
});

app.get('/api/mappings/list', (req, res) => {
    const mappingsDir = path.join(__dirname, 'wiremock', 'mappings');
    if (!fs.existsSync(mappingsDir)) {
        return res.json([]);
    }
    try {
        const files = fs.readdirSync(mappingsDir);
        res.json(files);
    } catch (error) {
        console.error('Error listing mappings:', error);
        res.status(500).json({ error: 'Error listing mappings' });
    }
});

app.get('/api/mappings/download/:name', (req, res) => {
    const name = req.params.name;
    const mappingsDir = path.join(__dirname, 'wiremock', 'mappings');
    const fullPath = path.join(mappingsDir, name);

    if (!fs.existsSync(fullPath)) {
        return res.status(404).send('Mapping not found');
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
        const archive = archiver('zip', { zlib: { level: 9 } });
        res.attachment(`${name}.zip`);
        archive.pipe(res);
        archive.directory(fullPath, false);
        archive.finalize();
    } else {
        res.download(fullPath); // Sirve el archivo directamente
    }
});

app.post('/api/mappings/download-batch', (req, res) => {
    const { names } = req.body;
    if (!names || !Array.isArray(names) || names.length === 0) {
        return res.status(400).json({ error: 'Se requiere un array de nombres de mappings.' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const mappingsDir = path.join(__dirname, 'wiremock', 'mappings');

    res.attachment('mappings-batch.zip');
    archive.pipe(res);

    names.forEach(name => {
        const fullPath = path.join(mappingsDir, name);
        if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
                archive.directory(fullPath, name);
            } else {
                archive.file(fullPath, { name });
            }
        }
    });

    archive.finalize();
});


// --- Lógica de Workers ---

const jobQueue = [];
let jobIdCounter = 0;
const maxWorkers = parseInt(process.env.MAX_PARALLEL_TESTS, 10) || 2;
const workerPool = [];

function sanitize(name) {
    return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function cleanupOldReports(featureReportDir) {
    const maxReports = parseInt(process.env.MAX_REPORTS_PER_FEATURE, 10) || 5;
    if (!fs.existsSync(featureReportDir)) return;

    const reports = fs.readdirSync(featureReportDir)
        .map(name => ({ name, path: path.join(featureReportDir, name) }))
        .filter(item => fs.statSync(item.path).isDirectory())
        .map(item => ({ ...item, time: fs.statSync(item.path).mtime.getTime() }))
        .sort((a, b) => a.time - b.time); // Sort oldest first

    if (reports.length > maxReports) {
        const reportsToDelete = reports.slice(0, reports.length - maxReports);
        reportsToDelete.forEach(report => {
            fs.rm(report.path, { recursive: true, force: true }, (err) => {
                if (err) console.error(`Error eliminando reporte antiguo ${report.path}:`, err);
                else console.log(`Reporte antiguo eliminado: ${report.name}`);
            });
        });
    }
}

function handleReport(job, reportPath) {
    try {
        const branch = sanitize(job.branch);
        const feature = sanitize(job.feature);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const destDir = path.join(__dirname, 'public', 'reports', branch, feature, timestamp);

        fs.mkdirSync(destDir, { recursive: true });
        fs.cpSync(reportPath, destDir, { recursive: true });
        
        console.log(`Reporte copiado a ${destDir}`);

        const featureReportDir = path.join(__dirname, 'public', 'reports', branch, feature);
        cleanupOldReports(featureReportDir);

        return `/reports/${branch}/${feature}/${timestamp}/`;
    } catch (error) {
        console.error('Error al manejar el reporte de Allure:', error);
        return null;
    }
}

function broadcastStatus() {
    const activeJobs = workerPool.filter(w => w.status === 'busy').length;
    io.emit('queue_status_update', {
        active: activeJobs,
        queued: jobQueue.length,
        limit: maxWorkers,
        queue: jobQueue
    });
    const slots = workerPool.map(worker => ({
        slotId: worker.id,
        job: worker.currentJob ? { id: worker.currentJob.id, featureName: worker.currentJob.feature } : null,
        status: worker.status,
        branch: worker.branch,
        client: worker.client,
        apkIdentifier: worker.apkIdentifier,
        apkSourceType: worker.apkSourceType
    }));
    io.emit('worker_pool_update', slots);
}

function checkIdleAndCleanup() {
    const isQueueEmpty = jobQueue.length === 0;
    const idleWorkers = workerPool.filter(w => w.status === 'ready');

    if (isQueueEmpty && idleWorkers.length > 0) {
        io.emit('log_update', { logLine: `--- 🧹 Cola vacía. Generando reportes finales para workers inactivos... ---
` });
        
        idleWorkers.forEach(worker => {
            if (!worker.terminating) { 
                worker.terminating = true; 
                worker.process.send({ type: 'GENERATE_UNIFIED_REPORT' });
            }
        });
    }
}

function processQueue() {
    if (jobQueue.length === 0) {
        checkIdleAndCleanup();
        return;
    }

    console.log(`Procesando cola con ${jobQueue.length} trabajos...`);

    const jobsToProcess = jobQueue.length;
    for (let i = 0; i < jobsToProcess; i++) {
        const job = jobQueue.shift();
        const assigned = assignJobToWorker(job);
        if (!assigned) {
            jobQueue.push(job);
        }
    }
    broadcastStatus();
}

function assignJobToWorker(job) {
    const apkSourceType = job.localApk ? 'local' : 'registry';
    const apkIdentifier = job.localApk || job.apkVersion || process.env.APK_PATH;

    // Para workers locales, el deviceSerial es un criterio de búsqueda.
    const isLocal = process.env.DEVICE_SOURCE === 'local';

    let worker = workerPool.find(w => {
        const baseMatch = w.branch === job.branch && 
                          w.client === job.client && 
                          w.apkIdentifier === apkIdentifier &&
                          w.apkSourceType === apkSourceType &&
                          w.status === 'ready';
        if (!baseMatch) return false;
        // Si es local, también debe coincidir el serial del dispositivo.
        if (isLocal) {
            return w.deviceSerial === job.deviceSerial;
        }
        return true;
    });

    if (worker) {
        runJobOnWorker(job, worker);
        return true;
    }

    if (workerPool.length < maxWorkers) {
        // Pasamos el deviceSerial al crear el worker.
        const newWorker = createWorker(job.branch, job.client, apkIdentifier, apkSourceType, job.deviceSerial, job.persistentWorkspace);
        runJobOnWorker(job, newWorker);
        return true;
    }

    return false;
}

async function startRecordingSequence(job, worker) {
    const { id, feature } = job;
    const { id: slotId } = worker;
    try {
        console.log(`Iniciando secuencia de grabación para el job ${id}`);
        io.emit('log_update', { slotId, logLine: `--- 🔴 Iniciando secuencia de grabación para ${feature} ---
` });
        
        io.emit('log_update', { slotId, logLine: `   -> Reseteando mappings...
` });
        await fetch(`http://localhost:${PORT}/api/wiremock/mappings/reset`, { method: 'POST' });
        
        io.emit('log_update', { slotId, logLine: `   -> Cargando mappings base...
` });
        await fetch(`http://localhost:${PORT}/api/wiremock/load-base-mappings`, { method: 'POST' });
        
        io.emit('log_update', { slotId, logLine: `   -> Iniciando grabación...
` });
        await fetch(`http://localhost:${PORT}/api/wiremock/recordings/start`, { method: 'POST' });

        io.emit('log_update', { slotId, logLine: `--- ▶️ Grabación iniciada. Ejecutando test... ---
` });
    } catch (error) {
        console.error(`Error durante la secuencia de grabación para el job ${id}:`, error);
        io.emit('log_update', { slotId, logLine: `--- ❌ Error al iniciar la grabación para ${feature}: ${error.message} ---
` });
        throw error;
    }
}

async function runJobOnWorker(job, worker) {
    const wasReady = worker.status === 'ready';
    worker.status = 'busy';
    worker.currentJob = job;
    job.slotId = worker.id;

    io.emit('job_started', {
        slotId: worker.id,
        featureName: job.feature,
        jobId: job.id,
        branch: worker.branch
    });

    if (wasReady) {
        try {
            if (job.record) {
                await startRecordingSequence(job, worker);
            }
            console.log(`Enviando job ${job.id} a worker ${worker.id} que ya estaba listo.`);
            worker.process.send({ type: 'START', job });
        } catch (error) {
            // Handle recording sequence error
        }
    }
    
    broadcastStatus();
}

function createWorker(branch, client, apkIdentifier, apkSourceType, deviceSerial) {
    const workerId = workerPool.length > 0 ? Math.max(...workerPool.map(w => w.id)) + 1 : 0;

    const forkOptions = {};
    // Cuando se ejecuta en modo local DENTRO de Docker, necesitamos decirle al worker
    // dónde encontrar el servidor ADB del host. 'host.docker.internal' es un DNS
    // especial de Docker que resuelve a la IP del host.
    if (process.env.DEVICE_SOURCE === 'local' && process.env.IS_DOCKER) {
        console.log(`[SERVER] Docker local mode detected. Injecting ANDROID_ADB_SERVER_HOST=host.docker.internal for worker ${workerId}`);
        forkOptions.env = {
            ...process.env,
            ANDROID_ADB_SERVER_HOST: 'host.docker.internal'
        };
    }
    const workerProcess = fork(path.join(__dirname, 'worker.js'), [], forkOptions);

    const worker = {
        id: workerId,
        process: workerProcess,
        branch: branch,
        client: client,
        apkIdentifier: apkIdentifier,
        apkSourceType: apkSourceType,
        deviceSerial: deviceSerial, // Se almacena el serial en el worker
        status: 'initializing',
        currentJob: null,
        terminating: false
    };

    workerPool.push(worker);
    let logMessage = `Worker ${worker.id} creado para la branch ${branch}, cliente ${client}, APK: ${apkIdentifier} (source: ${apkSourceType})`;
    if (deviceSerial) {
        logMessage += `, Dispositivo: ${deviceSerial}`;
    }
    console.log(logMessage);

    // --- Lógica de Workspace Persistente ---
    const sanitizedBranch = sanitize(branch);
    const workerWorkspacePath = path.join(process.env.PERSISTENT_WORKSPACES_ROOT || os.tmpdir(), sanitizedBranch);
    fs.mkdirSync(workerWorkspacePath, { recursive: true });
    console.log(`[SERVER] Asignando workspace a worker ${workerId}: ${workerWorkspacePath}`);
    
    const isPersistent = !!process.env.PERSISTENT_WORKSPACES_ROOT;
    const initMessage = { type: 'INIT', branch, client, workerWorkspacePath, isPersistent }; // Pass persistent workspace path and flag
    if (apkSourceType === 'local') {
        initMessage.localApkPath = path.join(process.env.LOCAL_APK_DIRECTORY, apkIdentifier);
    } else {
        initMessage.apkVersion = apkIdentifier;
    }

    // Si es un worker para un dispositivo local, enviamos el serial en el mensaje INIT.
    if (process.env.DEVICE_SOURCE === 'local') {
        initMessage.deviceSerial = deviceSerial;
    }
    
    worker.process.send(initMessage);

    workerProcess.on('message', async (message) => {
        const currentJob = worker.currentJob;
        const slotId = worker.id;

        switch (message.type) {
            case 'READY':
                console.log(`Worker ${worker.id} reportó READY.`);
                worker.status = 'ready';
                
                if (worker.currentJob) {
                    try {
                        if (worker.currentJob.record) {
                            await startRecordingSequence(worker.currentJob, worker);
                        }
                        console.log(`Worker ${worker.id} está listo, iniciando job ${worker.currentJob.id}.`);
                        worker.status = 'busy';
                        worker.process.send({ type: 'START', job: worker.currentJob });
                    } catch (error) {
                        // Handle recording sequence error
                    }
                } else {
                    processQueue();
                }
                broadcastStatus();
                break;

            case 'READY_FOR_NEXT_JOB':
                console.log(`Worker ${worker.id} reportó READY_FOR_NEXT_JOB.`);

                if (currentJob && currentJob.record) {
                    try {
                        console.log(`Finalizando secuencia de grabación para el job ${currentJob.id}`);
                        io.emit('log_update', { slotId, logLine: `--- ⏹ Deteniendo grabación para ${currentJob.feature}... ---
` });
                        const featureName = path.basename(currentJob.feature, '.feature');
                        const response = await fetch(`http://localhost:${PORT}/api/wiremock/recordings/stop`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ recordingName: featureName, saveAsSingleFile: true })
                        });
                        if (!response.ok) throw new Error(`Status ${response.status}`);
                        const result = await response.json();
                        io.emit('log_update', { slotId, logLine: `--- 💾 Mappings guardados en ${result.summary.filesCreated > 1 ? 'directorio' : 'archivo'} ${featureName}.json (${result.summary.totalMappings} mappings) ---
` });
                    } catch (error) {
                        console.error(`Error al detener la grabación para el job ${currentJob.id}:`, error);
                        io.emit('log_update', { slotId, logLine: `--- ❌ Error al guardar los mappings para ${currentJob.feature}: ${error.message} ---
` });
                    }
                }

                worker.status = 'ready';

                let reportUrl = null;
                if (message.data && message.data.reportPath) {
                    reportUrl = handleReport(currentJob, message.data.reportPath);
                }

                worker.currentJob = null;
                io.emit('job_finished', { 
                    slotId,
                    jobId: currentJob.id,
                    exitCode: message.data?.exitCode ?? 0,
                    reportUrl: reportUrl 
                });
                broadcastStatus();
                processQueue();
                break;

            case 'UNIFIED_REPORT_READY':
                console.log(`Worker ${worker.id} reportó UNIFIED_REPORT_READY.`);
                if (message.data && message.data.reportPath) {
                    const syntheticJob = { branch: worker.branch, feature: `_ReporteUnificado_${worker.client}`, client: worker.client };
                    handleReport(syntheticJob, message.data.reportPath);
                }
                worker.process.send({ type: 'TERMINATE' });
                break;

            case 'LOG':
                io.emit('log_update', { slotId, logLine: message.data });
                break;
        }
    });

    workerProcess.on('close', async (code) => {
        console.log(`Worker ${worker.id} se cerró con código ${code}.`);
        const index = workerPool.findIndex(w => w.id === worker.id);
        if (index !== -1) {
            workerPool.splice(index, 1);
        }

        const { currentJob } = worker;
        if (worker.status === 'busy' && currentJob && !worker.terminating) {
            io.emit('log_update', { logLine: `--- ⚠️ Worker murió inesperadamente. Re-encolando job ${currentJob.id}... ---
` });
            io.emit('job_finished', { slotId: worker.id, jobId: currentJob.id, exitCode: code });
            jobQueue.unshift(currentJob);
        }
        
        broadcastStatus();
        processQueue();
    });

    workerProcess.on('error', (err) => {
        console.error(`Error irrecuperable en el worker ${worker.id}:`, err);
    });

    return worker;
}


// --- Manejo de Socket.IO ---

const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

io.use((socket, next) => {
    if (socket.request.user) {
        next();
    } else {
        console.log('Rechazando conexión de socket no autenticada.');
        next(new Error('unauthorized'));
    }
});

io.on('connection', (socket) => {
    console.log('Un cliente se ha conectado:', socket.id);

    socket.emit('init', {
        slots: workerPool.map(worker => ({
            slotId: worker.id,
            job: worker.currentJob ? { id: worker.currentJob.id, featureName: worker.currentJob.feature } : null,
            status: worker.status,
            branch: worker.branch
        })),
        status: {
            active: workerPool.filter(w => w.status === 'busy').length,
            queued: jobQueue.length,
            limit: maxWorkers
        }
    });

    socket.on('run_test', (data) => {
        console.log('--- DEBUG: Datos recibidos en run_test ---', data);
        const { persistentWorkspace } = data; // Extract persistentWorkspace

        if (data.record) {
            // --- Lógica de Record & Verify ---
            const recordJobId = ++jobIdCounter;
            const verifyJobId = ++jobIdCounter;

            const recordJob = { ...data, id: recordJobId, record: true, persistentWorkspace }; // Pass persistentWorkspace
            const verifyJob = {
                ...data,
                id: verifyJobId,
                record: false,
                highPriority: true, // Para que se ejecute justo después
                mappingToLoad: `${data.feature}.json`,
                persistentWorkspace // Pass persistentWorkspace
            };

            // Encolar el de grabación primero, luego el de verificación
            if (recordJob.highPriority) {
                jobQueue.unshift(verifyJob, recordJob); // El de grabación queda primero
                io.emit('log_update', { logLine: `--- ⚡️ Test de grabación y verificación para '${data.feature}' añadido a la cola con prioridad alta. ---
` });
            } else {
                jobQueue.push(recordJob, verifyJob);
                io.emit('log_update', { logLine: `--- 📼 Petición de grabación y verificación para '${data.feature}' encolada. ---
` });
            }

        } else {
            // --- Lógica normal ---
            const job = { ...data, id: ++jobIdCounter, persistentWorkspace }; // Pass persistentWorkspace
            if (data.usePreexistingMapping) {
                job.mappingToLoad = `${data.feature}.json`;
            }
            if (job.highPriority) {
                jobQueue.unshift(job);
                io.emit('log_update', { logLine: `--- ⚡️ Test '${job.feature}' añadido a la cola con prioridad alta. ---
` });
            } else {
                jobQueue.push(job);
                io.emit('log_update', { logLine: `--- ⏳ Petición para '${job.feature}' encolada. ---
` });
            }
        }
        processQueue();
    });

    socket.on('run_batch', (data) => {
        console.log('--- DEBUG: Datos recibidos en run_batch ---', data);
        const { jobs = [], record = false, usePreexistingMapping = false, persistentWorkspace } = data; // Extract persistentWorkspace
        const highPriority = jobs.length > 0 && jobs[0].highPriority;

        let jobsToQueue = [];

        if (record) {
            // --- Lógica de Record & Verify para Lotes ---
            const logMessage = highPriority
                ? `--- ⚡️ Recibido lote de ${jobs.length} tests para Grabación y Verificación con prioridad alta. Encolando... ---
`
                : `--- 📼 Recibido lote de ${jobs.length} tests para Grabación y Verificación. Encolando... ---
`;
            io.emit('log_update', { logLine: logMessage });

            jobsToQueue = jobs.flatMap(jobData => {
                const recordJob = {
                    ...jobData,
                    id: ++jobIdCounter,
                    record: true,
                    persistentWorkspace // Pass persistentWorkspace
                };
                const verifyJob = {
                    ...jobData,
                    id: ++jobIdCounter,
                    record: false,
                    mappingToLoad: `${jobData.feature}.json`,
                    persistentWorkspace // Pass persistentWorkspace
                };
                return [recordJob, verifyJob]; // Devuelve el par intercalado
            });

        } else {
            // --- Lógica normal para Lotes ---
            const logMessage = highPriority
                ? `--- ⚡️ Recibido lote de ${jobs.length} tests con prioridad alta. Encolando... ---
`
                : `--- 📥 Recibido lote de ${jobs.length} tests. Encolando... ---
`;
            io.emit('log_update', { logLine: logMessage });

            jobsToQueue = jobs.map(jobData => {
                const newJob = {
                    ...jobData,
                    id: ++jobIdCounter,
                    record: false, // Asegurarse que record es false si no es un lote de grabación
                    persistentWorkspace // Pass persistentWorkspace
                };
                if (usePreexistingMapping) {
                    newJob.mappingToLoad = `${jobData.feature}.json`;
                }
                return newJob;
            });
        }

        if (highPriority) {
            jobQueue.unshift(...jobsToQueue.reverse());
        } else {
            jobQueue.push(...jobsToQueue);
        }
        
        processQueue();
    });

    socket.on('stop_test', (data) => {
        const { slotId, jobId } = data;
        const worker = workerPool.find(w => w.id === slotId && w.currentJob?.id === jobId);
        if (worker) {
            worker.terminating = true;
            worker.process.kill('SIGTERM');
            console.log(`Señal SIGTERM enviada al worker ${worker.id}`);
        } else {
            console.log(`No se pudo detener el job ${jobId}: no se encontró.`);
        }
    });

    socket.on('cancel_job', (data) => {
        const { jobId } = data;
        const index = jobQueue.findIndex(job => job.id === jobId);
        if (index !== -1) {
            const canceledJob = jobQueue.splice(index, 1);
            console.log(`Job ${jobId} (${canceledJob[0].feature}) cancelado de la cola.`);
            io.emit('log_update', { logLine: `--- 🚫 Job '${canceledJob[0].feature}' cancelado por el usuario. ---
` });
            broadcastStatus();
        } else {
            console.log(`No se pudo cancelar el job ${jobId}: no se encontró en la cola.`);
        }
    });

    socket.on('stop_all_execution', () => {
        console.log('--- 🛑 Recibida orden de PARAR TODO ---');
        io.emit('log_update', { logLine: `--- 🛑 Recibida orden de PARAR TODO por un usuario. Limpiando cola y deteniendo workers... ---
` });

        // 1. Limpiar la cola de jobs pendientes
        const canceledJobs = jobQueue.splice(0, jobQueue.length);
        console.log(`Cancelados ${canceledJobs.length} jobs de la cola.`);

        // 2. Detener todos los workers activos
        workerPool.forEach(worker => {
            if (worker.process) {
                worker.terminating = true;
                worker.process.kill('SIGTERM');
                console.log(`Señal SIGTERM enviada al worker ${worker.id}`);
            }
        });

        // 3. Actualizar el estado en la UI
        broadcastStatus();
    });

    socket.on('prepare_workspace', (data) => {
        const { branch } = data;
        const logPrefix = `[Workspace Prep: ${branch}]`;
        const logSlot = { slotId: 'system' }; // Use system log panel

        if (!process.env.PERSISTENT_WORKSPACES_ROOT) {
            io.emit('log_update', { ...logSlot, logLine: `${logPrefix} ❌ Error: La función de workspaces persistentes no está habilitada en el servidor.\n` });
            return;
        }

        if (!branch) {
            io.emit('log_update', { ...logSlot, logLine: `${logPrefix} ❌ Error: No se ha especificado una branch.\n` });
            return;
        }

        // Limpiar el panel de sistema antes de empezar
        io.emit('log_clear', logSlot);
        io.emit('log_update', { ...logSlot, logLine: `--- 🚀 Iniciando preparación del workspace para la branch: ${branch} ---\n` });

        const sanitizedBranch = sanitize(branch);
        const workspacePath = path.join(process.env.PERSISTENT_WORKSPACES_ROOT, sanitizedBranch);
        fs.mkdirSync(workspacePath, { recursive: true });

        const setupScript = path.join(__dirname, 'scripts', 'setup-workspace.sh');
        const scriptProcess = spawn('bash', [setupScript, workspacePath, branch]);

        scriptProcess.stdout.on('data', (data) => {
            io.emit('log_update', { ...logSlot, logLine: data.toString() });
        });

        scriptProcess.stderr.on('data', (data) => {
            io.emit('log_update', { ...logSlot, logLine: `[stderr] ${data.toString()}` });
        });

        scriptProcess.on('close', (code) => {
            if (code === 0) {
                io.emit('log_update', { ...logSlot, logLine: `\n--- ✅ Preparación del workspace para ${branch} finalizada con éxito ---\n` });
                socket.emit('workspace_ready', { branch }); // Notificar al cliente que inició la acción
            } else {
                io.emit('log_update', { ...logSlot, logLine: `\n--- ❌ Error: La preparación del workspace para ${branch} falló con código ${code} ---\n` });
            }
        });

        scriptProcess.on('error', (err) => {
            io.emit('log_update', { ...logSlot, logLine: `${logPrefix} ❌ Error al iniciar el script: ${err.message}\n` });
        });
    });

    socket.on('commit_changes', async (data) => {
        const { branch, files, message } = data;
        const logPrefix = `[Git Commit: ${branch}]`;
        const logSlot = { slotId: 'system' }; // Use system log panel

        if (!process.env.PERSISTENT_WORKSPACES_ROOT) {
            io.emit('log_update', { ...logSlot, logLine: `${logPrefix} ❌ Error: La función de workspaces persistentes no está habilitada.\n` });
            return;
        }

        if (!branch || !files || files.length === 0 || !message) {
            io.emit('log_update', { ...logSlot, logLine: `${logPrefix} ❌ Error: Faltan datos para realizar el commit (branch, archivos o mensaje).\n` });
            return;
        }

        io.emit('log_update', { ...logSlot, logLine: `--- 🚀 Iniciando proceso de commit para la branch: ${branch} ---\n` });

        const sanitizedBranch = sanitize(branch);
        const workspacePath = path.join(process.env.PERSISTENT_WORKSPACES_ROOT, sanitizedBranch, 'appium');

        if (!fs.existsSync(workspacePath)) {
            io.emit('log_update', { ...logSlot, logLine: `${logPrefix} ❌ Error: No se encontró el workspace local.\n` });
            return;
        }

        // --- Validación de Seguridad de Archivos ---
        for (const file of files) {
            const fullPath = path.join(workspacePath, file);
            const resolvedPath = path.resolve(fullPath);
            if (!resolvedPath.startsWith(path.resolve(workspacePath))) {
                io.emit('log_update', { ...logSlot, logLine: `${logPrefix} ❌ Error de seguridad: Se intentó acceder a un archivo fuera del workspace: ${file}\n` });
                return;
            }
        }

        const executeGitCommand = (command, args) => {
            return new Promise((resolve, reject) => {
                const gitProcess = spawn(command, args, { cwd: workspacePath });

                gitProcess.stdout.on('data', (data) => {
                    io.emit('log_update', { ...logSlot, logLine: data.toString() });
                });

                gitProcess.stderr.on('data', (data) => {
                    io.emit('log_update', { ...logSlot, logLine: `[stderr] ${data.toString()}` });
                });

                gitProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`El comando de Git falló con código ${code}`));
                    }
                });

                gitProcess.on('error', (err) => {
                    reject(err);
                });
            });
        };

        try {
            const authenticatedUrl = getAuthenticatedUrl();

            io.emit('log_update', { ...logSlot, logLine: `${logPrefix} étape 1/5: Sincronizando con el repositorio remoto (git pull)...
` });
            await executeGitCommand('git', ['pull', '--rebase', 'origin', branch]);

            io.emit('log_update', { ...logSlot, logLine: `
${logPrefix} étape 2/5: Añadiendo archivos...
` });
            await executeGitCommand('git', ['add', ...files]);

            io.emit('log_update', { ...logSlot, logLine: `
${logPrefix} étape 3/5: Realizando commit...
` });
            await executeGitCommand('git', ['commit', '-m', message]);

            io.emit('log_update', { ...logSlot, logLine: `
${logPrefix} étape 4/5: Configurando URL remota para el push...
` });
            await executeGitCommand('git', ['remote', 'set-url', 'origin', authenticatedUrl]);

            io.emit('log_update', { ...logSlot, logLine: `
${logPrefix} étape 5/5: Empujando cambios al repositorio remoto...
` });
            await executeGitCommand('git', ['push', 'origin', branch]);

            io.emit('log_update', { ...logSlot, logLine: `
--- ✅ Proceso de commit finalizado con éxito para la branch: ${branch} ---
` });

        } catch (error) {
            io.emit('log_update', { ...logSlot, logLine: `\n--- ❌ Error durante el proceso de commit: ${error.message} ---\n` });
        }
    });

    socket.on('disconnect', () => {
        console.log('Un cliente se ha desconectado:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});