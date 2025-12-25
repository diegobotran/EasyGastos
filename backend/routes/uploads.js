const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Asegurarnos de que las carpetas uploads existan
const uploadDir = path.join(__dirname, '..', 'uploads');
const expensesDir = path.join(uploadDir, 'expenses');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(expensesDir)) {
  fs.mkdirSync(expensesDir, { recursive: true });
}

// Configuración de multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generar nombre único: timestamp-id-originalname
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// POST /api/uploads - subir un archivo (recibe 'file' en form-data)
router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Construir la URL pública del archivo
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    return res.json({ success: true, url: fileUrl, filename: req.file.filename });
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/uploads/expense-image - subir imagen de gasto con ID específico
router.post('/expense-image', authenticateToken, (req, res) => {
  // Usar multer.diskStorage estándar sin acceder a req.body en filename
  const expenseStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, expensesDir);
    },
    filename: function (req, file, cb) {
      // No podemos acceder a req.body aquí porque multer aún no lo ha parseado
      // Usar timestamp + nombre original, luego renombrarlo si es necesario
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `temp_${Date.now()}${ext}`;
      cb(null, filename);
    }
  });

  const expenseUpload = multer({ 
    storage: expenseStorage, 
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      // Aceptar solo imágenes
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  }).single('image');

  expenseUpload(req, res, function (err) {
    if (err) {
      console.error('❌ Uploads: Error:', err.message);
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    // Ahora req.body está disponible
    const expenseId = req.body.expenseId;
    
    if (!expenseId) {
      // Eliminar archivo temporal si no hay expenseId
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'expenseId is required' });
    }

    // Renombrar archivo con el expenseId
    const ext = path.extname(req.file.filename);
    const newFilename = `${expenseId}_${Date.now()}${ext}`;
    const oldPath = req.file.path;
    const newPath = path.join(expensesDir, newFilename);

    try {
      fs.renameSync(oldPath, newPath);
      console.log('✅ Uploads: Imagen guardada como:', newFilename);

      // URL relativa
      const relativeUrl = `/uploads/expenses/${newFilename}`;

      return res.json({ 
        success: true, 
        url: relativeUrl,
        filename: newFilename 
      });
    } catch (renameErr) {
      console.error('❌ Uploads: Error renombrando archivo:', renameErr);
      return res.status(500).json({ error: 'Error saving image' });
    }
  });
});

module.exports = router;
