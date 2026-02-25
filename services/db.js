const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
let db = null;

async function getDB() {
  if (db) return db;
  const client = new MongoClient(uri);
  await client.connect();
  db = client.db('autocerebra');
  return db;
}

async function getClients() {
  const database = await getDB();
  return database.collection('clients').find({}).toArray();
}

async function getClientById(id) {
  const database = await getDB();
  return database.collection('clients').findOne({ id });
}

async function getClientBySlug(slug) {
  const database = await getDB();
  return database.collection('clients').findOne({ slug });
}

async function saveClient(clientData) {
  const database = await getDB();
  const existing = await getClientById(clientData.id);
  if (existing) {
    await database.collection('clients').updateOne({ id: clientData.id }, { $set: { ...clientData, updatedAt: new Date().toISOString() } });
  } else {
    await database.collection('clients').insertOne({ ...clientData, createdAt: new Date().toISOString(), stats: { conversations: 0, leadsCapture: 0, appointmentsBooked: 0 } });
  }
  return getClientById(clientData.id);
}

async function deleteClient(id) {
  const database = await getDB();
  await database.collection('clients').deleteOne({ id });
}

async function getLeads(clientId) {
  const database = await getDB();
  const query = clientId ? { clientId } : {};
  return database.collection('leads').find(query).sort({ capturedAt: -1 }).toArray();
}

async function saveLead(lead) {
  const database = await getDB();
  await database.collection('leads').insertOne({ ...lead, id: `lead_${Date.now()}` });
}

async function saveConversation(sessionId, clientId, messages) {
  const database = await getDB();
  await database.collection('conversations').updateOne(
    { sessionId },
    { $set: { sessionId, clientId, messages: messages.slice(-30), updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

async function getConversationHistory(sessionId) {
  const database = await getDB();
  const conv = await database.collection('conversations').findOne({ sessionId });
  return conv?.messages || [];
}

async function getConversationsByClient(clientId, limit = 50) {
  const database = await getDB();
  return database.collection('conversations').find({ clientId }).sort({ updatedAt: -1 }).limit(limit).toArray();
}

async function updateClientStats(clientId, field) {
  const database = await getDB();
  await database.collection('clients').updateOne(
    { id: clientId },
    { $inc: { [`stats.${field}`]: 1 }, $set: { 'stats.lastActivity': new Date().toISOString() } }
  );
}

module.exports = {
  getClients, getClientById, getClientBySlug,
  saveClient, deleteClient,
  getLeads, saveLead,
  saveConversation, getConversationHistory, getConversationsByClient,
  updateClientStats,
};
