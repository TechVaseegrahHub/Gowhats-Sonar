const express = require('express');
const router = express.Router();
const crypto = require('crypto');

router.post('/generate', async (req, res) => {
    const { passphrase } = req.body;
    if (!passphrase || passphrase.length < 8) {
        return res.status(400).json({ 
            success: false,
            error: 'Secure passphrase (minimum 8 characters) is required' 
        });
    }
    
    try {
        // Generate proper 2048-bit RSA keys with PKCS8 format
        const keyPair = crypto.generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: "spki",
                format: "pem",
            },
            privateKeyEncoding: {
                type: "pkcs8",
                format: "pem",
                cipher: "aes-256-cbc",
                passphrase,
            },
        });
        
        res.json({
            success: true,
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            passphrase
        });
    } catch (error) {
        console.error("Key generation error:", error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

module.exports = router;
