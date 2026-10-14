const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

let isMongoConnected = false;
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadLocalStore() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { users: [], tasks: [], captures: [], chats: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to parse local store, reinitializing:', err.message);
    const initial = { users: [], tasks: [], captures: [], chats: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
}

function saveLocalStore(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to write local store:', err.message);
  }
}

// Mongoose Schemas for MongoDB production mode
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['spark', 'prime', 'care'], default: 'spark' },
  permissions: {
    SMS: { type: Boolean, default: true },
    Call: { type: Boolean, default: true },
    WhatsApp: { type: Boolean, default: true },
    Photos: { type: Boolean, default: true },
    Email: { type: Boolean, default: true },
    Laptop: { type: Boolean, default: true }
  },
  aiSettings: {
    url: { type: String, default: '' },
    model: { type: String, default: '' },
    key: { type: String, default: '' }
  },
  createdAt: { type: Date, default: Date.now }
});

const taskSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  time: { type: String, default: '09:00' },
  dateOffset: { type: Number, default: 0 },
  date: { type: String, default: '' },
  dateLabel: { type: String, default: '' },
  priority: { type: String, enum: ['h', 'm', 'l'], default: 'm' },
  category: { type: String, default: 'General' },
  intent: { type: String, default: 'confirmed_commitment' },
  needsConfirmation: { type: Boolean, default: false },
  location: { type: String, default: null },
  participants: { type: [String], default: [] },
  remindBefore: { type: Number, default: 30 },
  done: { type: Boolean, default: false },
  source: { type: String, default: 'You' },
  aiGenerated: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const captureSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  source: { type: String, default: 'SMS' },
  rawText: { type: String, required: true },
  category: { type: String, default: 'General' },
  intent: { type: String, default: 'general' },
  status: { type: String, default: 'Reminder set' },
  sensitive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const chatSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  actionProposal: { type: Object, default: null },
  createdAt: { type: Date, default: Date.now }
});

let MongoUser, MongoTask, MongoCapture, MongoChat;

async function initDB() {
  const uri = process.env.MONGO_URI;
  if (uri) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      isMongoConnected = true;
      MongoUser = mongoose.model('User', userSchema);
      MongoTask = mongoose.model('Task', taskSchema);
      MongoCapture = mongoose.model('Capture', captureSchema);
      MongoChat = mongoose.model('ChatMessage', chatSchema);
      console.log('Connected to MongoDB cluster.');
      return;
    } catch (err) {
      console.warn('MongoDB connection failed, falling back to persistent local storage:', err.message);
      isMongoConnected = false;
    }
  } else {
    console.log('No MONGO_URI specified. Operating with persistent file store (data/store.json).');
    isMongoConnected = false;
  }
}

// Unified Database Access Layer
const db = {
  isMongo: () => isMongoConnected,

  users: {
    async findOne(query) {
      if (isMongoConnected) return await MongoUser.findOne(query).lean();
      const store = loadLocalStore();
      return store.users.find(u => {
        if (query._id && u._id === query._id) return true;
        if (query.email && u.email.toLowerCase() === query.email.toLowerCase()) return true;
        return false;
      }) || null;
    },

    async create(doc) {
      doc.createdAt = new Date().toISOString();
      if (isMongoConnected) {
        const u = new MongoUser(doc);
        return (await u.save()).toObject();
      }
      const store = loadLocalStore();
      const _id = 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const user = { _id, permissions: { SMS: true, Call: true, WhatsApp: true, Photos: true, Email: true, Laptop: true }, ...doc };
      store.users.push(user);
      saveLocalStore(store);
      return user;
    },

    async updateOne(query, updates) {
      if (isMongoConnected) return await MongoUser.updateOne(query, updates);
      const store = loadLocalStore();
      const idx = store.users.findIndex(u => (query._id && u._id === query._id) || (query.email && u.email === query.email));
      if (idx !== -1) {
        store.users[idx] = { ...store.users[idx], ...updates };
        saveLocalStore(store);
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    }
  },

  tasks: {
    async find(query) {
      if (isMongoConnected) return await MongoTask.find(query).sort({ dateOffset: 1, time: 1 }).lean();
      const store = loadLocalStore();
      let res = store.tasks.filter(t => t.userId === query.userId);
      if (query.done !== undefined) res = res.filter(t => t.done === query.done);
      if (query.needsConfirmation !== undefined) res = res.filter(t => Boolean(t.needsConfirmation) === query.needsConfirmation);
      return res.sort((a, b) => (a.dateOffset - b.dateOffset) || a.time.localeCompare(b.time));
    },

    async findById(id) {
      if (isMongoConnected) return await MongoTask.findById(id).lean();
      const store = loadLocalStore();
      return store.tasks.find(t => t._id === id || t.id === id) || null;
    },

    async create(doc) {
      doc.createdAt = new Date().toISOString();
      if (isMongoConnected) {
        const t = new MongoTask(doc);
        return (await t.save()).toObject();
      }
      const store = loadLocalStore();
      const _id = 'tsk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const task = {
        _id,
        done: false,
        dateOffset: doc.dateOffset || 0,
        priority: doc.priority || 'm',
        intent: doc.intent || 'confirmed_commitment',
        needsConfirmation: Boolean(doc.needsConfirmation),
        location: doc.location || null,
        participants: doc.participants || [],
        remindBefore: doc.remindBefore || 30,
        ...doc
      };
      store.tasks.push(task);
      saveLocalStore(store);
      return task;
    },

    async updateById(id, updates) {
      if (isMongoConnected) return await MongoTask.findByIdAndUpdate(id, updates, { new: true }).lean();
      const store = loadLocalStore();
      const idx = store.tasks.findIndex(t => t._id === id || t.id === id);
      if (idx !== -1) {
        store.tasks[idx] = { ...store.tasks[idx], ...updates };
        saveLocalStore(store);
        return store.tasks[idx];
      }
      return null;
    },

    async deleteById(id) {
      if (isMongoConnected) return await MongoTask.findByIdAndDelete(id);
      const store = loadLocalStore();
      const prevLen = store.tasks.length;
      store.tasks = store.tasks.filter(t => t._id !== id && t.id !== id);
      saveLocalStore(store);
      return store.tasks.length < prevLen;
    },

    async clearUser(userId) {
      if (isMongoConnected) return await MongoTask.deleteMany({ userId });
      const store = loadLocalStore();
      store.tasks = store.tasks.filter(t => t.userId !== userId);
      saveLocalStore(store);
    }
  },

  captures: {
    async find(query, limit = 40) {
      if (isMongoConnected) return await MongoCapture.find(query).sort({ createdAt: -1 }).limit(limit).lean();
      const store = loadLocalStore();
      return store.captures.filter(c => c.userId === query.userId).reverse().slice(0, limit);
    },

    async create(doc) {
      doc.createdAt = new Date().toISOString();
      if (isMongoConnected) {
        const c = new MongoCapture(doc);
        return (await c.save()).toObject();
      }
      const store = loadLocalStore();
      const _id = 'cap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const capture = { _id, ...doc };
      store.captures.push(capture);
      saveLocalStore(store);
      return capture;
    },

    async clearUser(userId) {
      if (isMongoConnected) return await MongoCapture.deleteMany({ userId });
      const store = loadLocalStore();
      store.captures = store.captures.filter(c => c.userId !== userId);
      saveLocalStore(store);
    }
  },

  chats: {
    async find(query, limit = 30) {
      if (isMongoConnected) return await MongoChat.find(query).sort({ createdAt: 1 }).limit(limit).lean();
      const store = loadLocalStore();
      return store.chats.filter(c => c.userId === query.userId).slice(-limit);
    },

    async create(doc) {
      doc.createdAt = new Date().toISOString();
      if (isMongoConnected) {
        const c = new MongoChat(doc);
        return (await c.save()).toObject();
      }
      const store = loadLocalStore();
      const _id = 'cht_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const chat = { _id, ...doc };
      store.chats.push(chat);
      saveLocalStore(store);
      return chat;
    },

    async clearUser(userId) {
      if (isMongoConnected) return await MongoChat.deleteMany({ userId });
      const store = loadLocalStore();
      store.chats = store.chats.filter(c => c.userId !== userId);
      saveLocalStore(store);
    }
  }
};

module.exports = { initDB, db };
