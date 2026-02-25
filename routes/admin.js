const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const { requireAuth, generateToken } = require('../middleware/auth');
const {
  getClients, getClientById, saveClient, deleteClient,
  getLeads, getConversationsByClient,
} = require('../services/db');
const googleCalendar = require('../services/googleCalendar');

const ADMIN_USER = process.env.ADMIN_USER || 'ismael';
const ADMIN_PASS = process.env.ADMIN_PASS || 'autocerebra2025';

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const token = generateToken({ username, role: 'admin' });
  res.json({ token, username });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.admin.username, role: req.admin.role });
});

router.get('/clients', requireAuth, async (req, res) => {
  try {
    const clients = await getClients();
    res.json(clients);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/clients/:id', requireAuth, async (req, res) => {
  try {
    const c = await getClientById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(c);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/clients', requireAuth, async (req, res) => {
  try {
    const data = req.body;
    if (!data.business?.name) return res.status(400).json({ error: 'business.name requerido' });
    if (!data.bot?.name) return res.status(400).json({ error: 'bot.name requerido' });

    const slug = (data.business.name)
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 50);

    const newClient = {
      id: uuidv4(),
      slug: `${slug}-${Date.now().toString(36)}`,
      active: true,
      ...data,
    };

    const saved = await saveClient(newClient);
    res.status(201).json(saved);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/clients/:id', requireAuth, async (req, res) => {
  try {
    const existing = await getClientById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });
    const updated = await saveClient({ ...existing, ...req.body, id: req.params.id });
    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/clients/:id', requireAuth, async (req, res) => {
  try {
    const existing = await getClientById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });
    await deleteClient(req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/clients/:id/toggle', requireAuth, async (req, res) => {
  try {
    const existing = await getClientById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });
    const updated = await saveClient({ ...existing, active: !existing.active });
    res.json({ active: updated.active });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/clients/:id/google-auth', requireAuth, (req, res) => {
  const url = googleCalendar.getAuthUrl(req.params.id);
  res.json({ authUrl: url });
});

router.get('/google-callback', async (req, res) => {
  const { code, state: clientId } = req.query;
  if (!code || !clientId) return res.status(400).send('Parámetros inválidos');
  try {
    const tokens = await googleCalendar.exchangeCodeForTokens(code);
    const existing = await getClientById(clientId);
    if (!existing) return res.status(404).send('Cliente no encontrado');
    await saveClient({ ...existing, booking: { ...existing.booking, googleCalendar: { ...existing.booking?.googleCalendar, credentials: tokens } } });
    res.send(`<script>window.opener?.postMessage({type:'google-auth-success',clientId:'${clientId}'},'*');window.close();</script>`);
  } catch(e) { res.status(500).send(`Error: ${e.message}`); }
});

router.get('/leads', requireAuth, async (req, res) => {
  try {
    const { clientId } = req.query;
    res.json(await getLeads(clientId));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/leads/:clientId', requireAuth, async (req, res) => {
  try {
    res.json(await getLeads(req.params.clientId));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/conversations/:clientId', requireAuth, async (req, res) => {
  try {
    res.json(await getConversationsByClient(req.params.clientId, 100));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const clients = await getClients();
    const leads = await getLeads();
    res.json({
      totalClients: clients.length,
      activeClients: clients.filter(c => c.active).length,
      totalConversations: clients.reduce((sum, c) => sum + (c.stats?.conversations || 0), 0),
      totalLeads: clients.reduce((sum, c) => sum + (c.stats?.leadsCapture || 0), 0),
      totalAppointments: clients.reduce((sum, c) => sum + (c.stats?.appointmentsBooked || 0), 0),
      recentLeads: leads.slice(0, 5),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
