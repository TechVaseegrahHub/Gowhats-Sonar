// Use your existing application setup
require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('./src/models/Tenant');

async function updateKeys() {
  try {
    // Connect to MongoDB using your app's connection
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://techvaseegrah:I6KMVhe5Ru6OsJ7N@gowhats.u2mth.mongodb.net/GoWhats_test?retryWrites=true&w=majority&appName=gowhats');
    
    console.log('Connected to MongoDB');
    
    // Find and update the tenant
    const result = await Tenant.findByIdAndUpdate(
      'e1c69d55-5073-4f08-91bf-633648ad06b0',
      {
        $set: {
          'flowConfig.privateKey': `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFNTBfBgkqhkiG9w0BBQ0wUjAxBgkqhkiG9w0BBQwwJAQQbRX16mKp10Kj9dBQ
YXchFAICCAAwDAYIKoZIhvcNAgkFADAdBglghkgBZQMEASoEEH9q2jhrK89sEqH9
DjAfkBQEggTQY6qHMbOweXCL5RJtkgVt23Hc6lc4kl4bllut1WIWS4ElzhtboCdl
oWEbfXY/Kg3qsa0Roh+0QmKEVS/ta458QrDmu5lbhGyYvcGHX/G8uPh0d18LlzEk
P7EJmMysWJDtPWV48eiWNd9kTfJL9OQU7rR7Gf3hI5vY5M0jNrVlekq1Nai7ZlXf
aOwv2syWQs2/o8vwldsr9RK31zUR9eNODnFAWxB9p3NQofaO5ZH6QBVfTiiGKZo0
3l/g/QstcXIaDlGW5B80yRJKXuXNL7tRLGszIO0UT5KYLGFDCctyOIp4rzVf4cI7
ODKGOP/KO0faxW1MV5RHKeCdauUl2re8z9OAVGEJrhAeJlObiphILYzgaAG28lwo
90GatEQeG0GWmCuAa8EnuCxrlwf9GJ/JIOVhZj2snqRlUtBDT9H7ZB05/QEkRIOc
iuckMVVVQ11sGShgtgwdawhhBZALRT6UxkMdKajAs20ILJVvgG8C5nUTXRsEnb3c
4LtvFo52lR13G4zeV6LGwwWbqYMw+TMVuGWX0Ia3IvR8G3t9oStb613XmqpYL0AA
/nY84gR2wHdBghi3/q6SujJcw7OHXFRuLBwDUGXZfkMDLg7NZ8H/RIrzJSQn3Hoc
LwGl6vJyLCMeHzI62HimfaIoPZau0nYnSFaDFcHs0VtVF4StZIwzuoVC8yC6qZsR
OSFQ4X37EiDC0fZo2pGG8W3Q3/yugBrzP4DF2ye8ew3Pb3Q/QVpEGfAeJs9aBdft
LRYGIsMfryq695MbBWKuMAz608nPGG/ghUtARs0PRCAeWSeuKchydgC2s0HafWAp
OKCv1oVFTN/bSOXKN2ZgTdCylkpbVRpE0LfgQumTR/VJPb6WW2goXlbrtQnz/yFc
5B6QLlHba0Eqkj19rQXIVvLVTgkPVjvXOp/O+JdfhCsIB+u5YILf6b8Z+qOCbSby
P6uz9+YKNWNjotwQlN9W+l0RZjyyTdFrgkrlsDvOPoWK2puIxoOVXV+jUOeB0+S9
y7r2AdEBkCcoDDTvvBjpU+SpsLfMO3IkiOqCXeCuJdrBgMicRbpPONhNd7CbiwIM
eA+C38nlZpvV46F8aEZehRBF13D8fmzweRSDFlGT/hZ+i9CObLH4x28xjyCRZ02i
B7BT1YXEQHj1XRrkW4/UQAORNoHUBr5Yd/X69bYy84OjsO37HVwAhseuxlbtYa97
fLAugUFLIX6OK0geLaJZh3G6HQ5ZPI7Zt2c6k5bPe+4MzbvhMZ0vUjA8FOds8i50
jUjIZf4taa705kM5AhoZ2IpL8JgHZ2rHK6xVr6NuNL8OwGo6hWXykWc7a8rXII8L
329pHaT8i2KV3JZ+aOIuf+QS8I2wZcfzEBVlu8u9aKehesqYPP7kYypLjjjr2Fio
rXwWC0MKC5opDThVkle4Hfh5bQ1lkFpjHkUhRmo8az1rTOF8jYE00EacwMv7vvbn
F4G5N3fTvot+7Aug6fyCw0h0BZiaBMPLMBTildNLiznTPfLIsNQY+phM2S7oAATY
/cMWhMz4jB/ulPcNXPZU/t/xlbJUjxQzSWiNR/WTOzDPxHTQ9nOXweiXxUJ/Gf3H
tqcSCbC7MxTTliJlk77YOGAhZ7igPo0xfIX/CWQAuIda7G8pPLwJYAA=
-----END ENCRYPTED PRIVATE KEY-----`,
          'flowConfig.publicKey': `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4G+P+Kr9JleRJSxO38Lv
0rZYPAoVawciG//ZwVQB46VlzV51yedc8HCTXZraRQP+2exri0OOO2xsO7VNHuqJ
VsBynfQoJr3ih+UXPWn+2w9wGQHSsqscDYjytjGppNSTJBNIiuKnLFPX0miBk2hA
OWldnyVOcg6cb3ovsaTnH2zQht7unAXHZJcqeWd0ZaozJ0xkB6cZri4UjAr0OFeO
DgULSlTOtKKfEaY/1d2tAsSQ/ZbdL8VsLUTM4O0wk+69p2koKEKMYMie6Wwh9IHt
M/6612gq1PJiNiSrxtM95YCA2H78nmLEH81MgPYnRAebTfZEjlTuJHfj4bVVNQBo
cQIDAQAB
-----END PUBLIC KEY-----`,
          'flowConfig.passphrase': 'Sujitha2025New',
          'flowConfig.keysGenerated': new Date()
        }
      },
      { new: true }
    );
    
    if (result) {
      console.log('✅ Database updated successfully!');
      console.log('Updated tenant:', result._id);
    } else {
      console.log('❌ Tenant not found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

updateKeys();
