const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { models } = require('../database/init');

const resolveMongoUri = () => {
  const databaseName = process.env.DATABASE_NAME || 'easygastos';
  const configured = (process.env.MONGODB_URI || 'mongodb://localhost:27017').replace(/\/$/, '');
  return /mongodb(?:\+srv)?:\/\/[^/]+\/.+/.test(configured)
    ? configured
    : `${configured}/${databaseName}`;
};

const setAdminRole = async (email, isAdmin) => {
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Debe proporcionar un correo válido de un usuario existente.');
  }

  await mongoose.connect(resolveMongoUri(), { serverSelectionTimeoutMS: 10000 });
  try {
    const user = await models.User.findOneAndUpdate(
      { email: email.trim().toLowerCase(), isActive: true },
      { $set: { isAdmin } },
      { new: true }
    ).select('email isAdmin');

    if (!user) {
      throw new Error('No se encontró un usuario activo con ese correo.');
    }

    return { email: user.email, isAdmin: user.isAdmin };
  } finally {
    await mongoose.disconnect();
  }
};

module.exports = { setAdminRole };
