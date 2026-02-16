const mongoose = require('mongoose');

const registroSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  nick: { type: String, required: true },
  cargoNum: { type: String, required: true },
  status: { type: String, default: 'PENDENTE' },
  tentativas: { type: Number, default: 0 },
  mensagemPainelId: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Registro', registroSchema);
