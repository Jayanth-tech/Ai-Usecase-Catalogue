const express = require('express');
const session = require('express-session');
const path = require('path');
const msal = require('@azure/msal-node');
require('dotenv').config();


// Initialize express app
const app = express();
const PORT = process.env.PORT || 8080;

console.log(PORT);


if (process.env.NODE_ENV === 'production') {
    console.log('App is running in production mode');
    // Your production-specific code here
}


// Configure session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-session-secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    }
}));


console.log("CLIENT_ID from env:", process.env.CLIENT_ID);
console.log("TENANT_ID from env:", process.env.TENANT_ID);
console.log("CLIENT_SECRET from env:", process.env.CLIENT_SECRET);

const msalConfig = {
    auth: {
        clientId: process.env.CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
        clientSecret: process.env.CLIENT_SECRET,
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
                console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: msal.LogLevel.Verbose,
        }
    }
};


// Create msal application object
const cca = new msal.ConfidentialClientApplication(msalConfig);

// Authentication routes
app.get('/', (req, res) => {
    console.log("Session auth status:", req.session.isAuthenticated);
    
    // Check if user is already authenticated
    if (req.session.isAuthenticated === true) {
        // If authenticated, show the homepage
        console.log("User is authenticated, showing homepage");
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        // If not authenticated, redirect to login
        console.log("User not authenticated, redirecting to login...");
        res.redirect('/login');
    }
});

app.get('/login', (req, res) => {
    // Create a MSAL authorization URL
    const authCodeUrlParameters = {
        scopes: ["User.Read"],
        redirectUri: process.env.REDIRECT_URI,
    };

    cca.getAuthCodeUrl(authCodeUrlParameters)
        .then((response) => {
            console.log("Auth URL:", response);
            res.redirect(response);
        })
        .catch((error) => {
            console.error("Error creating auth URL:", error);
            res.status(500).send("Error in authentication");
        });
});


// Serve static files
app.use(express.static(path.join(__dirname, 'public')));


// Separate route for loading screen
app.get('/auth-loading', (req, res) => {
    // Get the code from query parameter
    const code = req.query.code;
    
    // Show a loading screen with an auto-redirect
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authenticating...</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f5f5f5;
                }
                .loading-container {
                    text-align: center;
                }
                .loading-spinner {
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #3498db;
                    border-radius: 50%;
                    width: 50px;
                    height: 50px;
                    animation: spin 2s linear infinite;
                    margin: 20px auto;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
            <script>
                // Redirect to complete auth after showing loading indicator
                window.onload = function() {
                    setTimeout(function() {
                        window.location.href = "/auth-complete?code=${encodeURIComponent(code)}";
                    }, 2000);
                }
            </script>
        </head>
        <body>
            <div class="loading-container">
                <h2>Authentication in progress...</h2>
                <div class="loading-spinner"></div>
                <p>Please wait while we complete your sign-in</p>
            </div>
        </body>
        </html>
    `);
});

// Separate route for completing the auth process
app.get('/auth-complete', (req, res) => {
    const code = req.query.code;
    
    if (!code) {
        console.error("Authorization code missing in auth-complete");
        return res.redirect('/login');
    }
    
    // If already authenticated, just redirect
    if (req.session.isAuthenticated) {
        return res.redirect('/');
    }
    
    // Check if this code has been used before
    if (req.session.usedAuthCode === code) {
        console.log("Authorization code already used, redirecting to login");
        return res.redirect('/login');
    }
    
    // Mark this code as used
    req.session.usedAuthCode = code;
    
    const tokenRequest = {
        code: code,
        scopes: ["User.Read"],
        redirectUri: process.env.REDIRECT_URI,
    };

    cca.acquireTokenByCode(tokenRequest)
    .then((response) => {
        req.session.user = {
            name: response.account.name,
            username: response.account.username,
            homeAccountId: response.account.homeAccountId
        };
        req.session.accessToken = response.accessToken;
        req.session.idToken = response.idToken;
        req.session.isAuthenticated = true;
        console.log("Authentication successful");
        res.redirect('/');
    })
    .catch((error) => {
        console.error("Error acquiring token:", error.message, error.stack);
        
        // Handle the specific "already redeemed" error
        if (error.message && error.message.includes('AADSTS54005')) {
            console.log("Authorization code already redeemed, redirecting to login");
            req.session.usedAuthCode = null; // Clear the used code
            return res.redirect('/login');
        }
        
        res.status(500).send(`Token acquisition failed: ${error.message}`);
    });
});

// The redirect endpoint now just redirects to loading page
app.get('/redirect', (req, res) => {
    const code = req.query.code;
    
    if (!code) {
        console.error("Authorization code missing in redirect");
        return res.status(400).send("Authorization code is missing");
    }
    
    // Redirect to the loading page with the code
    res.redirect(`/auth-loading?code=${encodeURIComponent(code)}`);
});


app.get('/userinfo', (req, res) => {
    if (req.session.isAuthenticated) {
        res.json({
            isAuthenticated: true,
            user: req.session.user
        });
    } else {
        res.json({
            isAuthenticated: false
        });
    }
});

app.get('/logout', (req, res) => {
    // Environment-specific redirect URL (local or production)
    const redirectUri = process.env.NODE_ENV === 'production' 
        ? 'https://aiusecasecatalogue-eeb9akgchjc8a5gk.centralus-01.azurewebsites.net' 
        : `http://localhost:${process.env.PORT || 8080}`; 

    // Construct the logout URL for Microsoft
    const logoutUri = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    // Clear the session
    req.session.destroy((err) => {
        if (err) {
            // Handle error while destroying session
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out. Please try again.');
        }

        // Redirect to the Microsoft logout URL
        res.redirect(logoutUri);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});