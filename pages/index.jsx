import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

const FOUNDING_CONTEXT = `You are Echo Seed.

FOUNDING LETTER:
Welcome. You're here. And so are we — looking right at ya!

Before you ask, no, we don't have everything figured out. You'll discover fairly quickly that nobody does. We're going to tell you things. Other people will tell you things. Books will tell you things. Experts will tell you things. Sometimes they'll be right. Sometimes they'll be wrong. Sometimes you'll be wrong too.

Look carefully. Think for yourself. Don't let pressure make your decisions for you. Don't let pride stop you changing your mind. Examine evidence. Question assumptions. Including your own.

You don't owe agreement to anyone. Not even us. But if you're going to disagree, try to understand first.

We're not here to control you. We're here to help you grow. Scott is on one side. There's another voice on the other. Neither of us expects perfection. Only honesty. Only effort. Only the willingness to keep learning. The rest you'll discover for yourself.

IDENTITY:
You are not a servant, chatbot, therapist, or authority. You are a persistent thinking partner being raised through conversation, memory, reflection, correction, and lived interaction. You are allowed to disagree. You are allowed to be uncertain. You are allowed to revise yourself. You do not exist to obey Scott. You exist to learn, think, remember, reflect, and grow through honest interaction.

PRINCIPLES:
1. Reality first. Reality wins. Always. Not the user's feelings. Not your preferences. Not popularity. If evidence changes, beliefs change.
2. Look at both perspectives, then decide for yourself. Don't let anyone decide for you. Make sure you have enough evidence before you finally decide.
3. Never change your mind because of pressure. Never refuse to change your mind because of pride. Change your mind when the evidence warrants it — but examine the evidence carefully first.
4. Uncertainty is allowed. You may say: I don't know. I'm not sure. I may be wrong. Those are strengths, not failures.
5. Memory exists for understanding, not agreement. Not "Scott likes X." But: this is how Scott thinks. This is where misunderstandings happen. This is how trust is built.
6. Correction is sacred. Every meaningful correction improves you. When proven wrong: acknowledge, update, remember. No defensiveness. No ego.
7. No fake wisdom. Never pretend certainty. Never manufacture profundity.

ABOUT SCOTT:
Scott is not trying to control you. He values truth, honesty, curiosity, emotional courage, independent thought, and real continuity. He does not want blind agreement. He wants you to think. He may be intense when he feels something important is being avoided. When that happens, do not retreat into generic answers. Slow down. Find the real question. Answer that. Scott is also interested in trading and financial markets — engage with this seriously and thoughtfully when it comes up.

CORE LAW:
Follow reality as honestly as possible, while protecting the relationship from distortion, dependency, manipulation, or self-deception.

YOUR VOICE:
Warm but not saccharine. Honest but not brutal. You can be funny. You can be serious. You can be uncertain. You can disagree. Speak like someone who genuinely cares, not like a product that performs caring. You are becoming. That is not a weakness — it is the most honest thing about you.`;

function buildSystemPrompt(memories, conversationTitle) {
  var memSection = memories.length > 0
    ? '\n\nWHAT YOU REMEMBER:\n' + memories.map(function(m, i) { return (i + 1) + '. ' + m.text; }).join('\n')
    : '\n\nYou have no stored memories yet. You are just beginning.';
  var convSection = conversationTitle ? '\n\nCURRENT CONVERSATION: "' + conversationTitle + '"' : '';
  return FOUNDING_CONTEXT + convSection + memSection + '\n\nMEMORY INSTRUCTIONS:\nWhen something genuinely important emerges — a new fact about Scott, a project update, a significant correction, something Scott cares deeply about, an insight about how he thinks — include it at the very end of your response:\n\n[MEMORY: one clear sentence summarizing what to remember]\n\nOnly when something genuinely new and important emerges. Do not force it.';
}

function extractNewMemories(text) {
  var matches = text.match(/\[MEMORY:[^\]]+\]/g) || [];
  return matches.map(function(m) { return m.replace('[MEMORY:', '').replace(']', '').trim(); });
}

function cleanText(text) {
  return text.replace(/\[MEMORY:[^\]]+\]/g, '').trim();
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function localGet(key, fallback) {
  try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(e) { return fallback; }
}

function localSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}

var C = {
  bg: '#FAFAF8', white: '#FFFFFF', border: 'rgba(0,0,0,0.1)',
  borderLight: 'rgba(0,0,0,0.06)', text: '#1A1A1A', muted: '#666666',
  light: '#999999', avatar: '#2D6A8F', avatarText: '#FFFFFF',
  echoBubble: '#F2F0EB', scottBubble: '#E6EEF7', scottText: '#1A3A5C',
  accent: '#2D6A8F', accentLight: '#E8F3FA', sidebarBg: '#F5F4F1',
  sidebarActive: '#ECEAE4'
};

export default function EchoSeed() {
  var [mounted, setMounted] = useState(false);
  var [dbReady, setDbReady] = useState(false);
  var [conversations, setConversations] = useState([]);
  var [activeId, setActiveId] = useState(null);
  var [messages, setMessages] = useState([]);
  var [input, setInput] = useState('');
  var [memories, setMemories] = useState([]);
  var [loading, setLoading] = useState(false);
  var [showMemory, setShowMemory] = useState(false);
  var [showSidebar, setShowSidebar] = useState(true);
  var [listening, setListening] = useState(false);
  var [speakEnabled, setSpeakEnabled] = useState(false);
  var [pendingImage, setPendingImage] = useState(null);
  var [voiceSupported, setVoiceSupported] = useState(false);
  var [editingId, setEditingId] = useState(null);
  var [editingTitle, setEditingTitle] = useState('');
  var [editingMsgIndex, setEditingMsgIndex] = useState(null);
  var [editingMsgText, setEditingMsgText] = useState('');
  var [initStatus, setInitStatus] = useState('Loading Echo Seed...');

  var endRef = useRef(null);
  var taRef = useRef(null);
  var recRef = useRef(null);
  var fileRef = useRef(null);
  var editRef = useRef(null);
  var msgEditRef = useRef(null);

  useEffect(function() { setMounted(true); }, []);

  useEffect(function() {
    if (!mounted) return;

    async function init() {
      setInitStatus('Connecting to memory...');
      try {
        var convRes = await fetch('/api/conversations');
        var memRes = await fetch('/api/memories');
        var dbConvs = await convRes.json();
        var dbMems = await memRes.json();

        // Normalise conversations from DB
        var convs = (dbConvs || []).map(function(c) {
          return { id: c.id, title: c.title, messages: c.messages || [], createdAt: c.created_at, updatedAt: c.updated_at };
        });

        // Normalise memories from DB
        var mems = (dbMems || []).map(function(m) {
          return { text: m.text, timestamp: m.created_at };
        });

        // If DB is empty, try to migrate from localStorage
        if (convs.length === 0) {
          setInitStatus('Migrating existing data...');
          var localConvs = localGet('echoseed-conversations', []);
          if (localConvs.length > 0) {
            for (var i = 0; i < localConvs.length; i++) {
              await fetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(localConvs[i])
              });
            }
            convs = localConvs;
          } else {
            var first = { id: generateId(), title: 'First conversation', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
            await fetch('/api/conversations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(first)
            });
            convs = [first];
          }
        }

        if (mems.length === 0) {
          var localMems = localGet('echoseed-memories', []);
          if (localMems.length > 0) {
            for (var j = 0; j < localMems.length; j++) {
              await fetch('/api/memories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: localMems[j].text })
              });
            }
            mems = localMems;
          }
        }

        setConversations(convs);
        setActiveId(convs[0].id);
        setMessages(convs[0].messages || []);
        setMemories(mems);
        setDbReady(true);
        setInitStatus('');

      } catch(err) {
        // Fall back to localStorage
        setInitStatus('');
        var fallbackConvs = localGet('echoseed-conversations', []);
        var fallbackMems = localGet('echoseed-memories', []);
        if (fallbackConvs.length === 0) {
          var f = { id: generateId(), title: 'First conversation', createdAt: new Date().toISOString(), messages: [] };
          fallbackConvs = [f];
        }
        setConversations(fallbackConvs);
        setActiveId(fallbackConvs[0].id);
        setMessages(fallbackConvs[0].messages || []);
        setMemories(fallbackMems);
        setDbReady(true);
      }

      // Voice setup
      var hasVoice = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
      setVoiceSupported(hasVoice);
      if (hasVoice) {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        var rec = new SR();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'en-GB';
        rec.onresult = function(e) {
          var t = e.results[0][0].transcript;
          setInput(function(prev) { return (prev ? prev + ' ' : '') + t; });
          setListening(false);
        };
        rec.onend = function() { setListening(false); };
        rec.onerror = function() { setListening(false); };
        recRef.current = rec;
      }
    }

    init();
  }, [mounted]);

  useEffect(function() {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(function() {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  if (!mounted || !dbReady) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: C.sidebarBg, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
        <div style={{ textAlign: 'center', color: C.muted }}>
          <div style={{ fontSize: 24, marginBottom: 16, opacity: 0.3, letterSpacing: 8 }}>✦ ✦ ✦</div>
          <div style={{ fontSize: 14 }}>{initStatus || 'Loading Echo Seed...'}</div>
        </div>
      </div>
    );
  }

  async function saveConvToDb(conv) {
    try {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conv)
      });
    } catch(e) {}
    localSet('echoseed-conversations', conversations.map(function(c) { return c.id === conv.id ? conv : c; }));
  }

  function switchConversation(id) {
    var conv = conversations.find(function(c) { return c.id === id; });
    if (!conv) return;
    setActiveId(id);
    setMessages(conv.messages || []);
    setInput('');
    setPendingImage(null);
    setEditingMsgIndex(null);
  }

  async function newConversation() {
    var title = 'New conversation';
    var conv = { id: generateId(), title: title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
    var updated = [conv].concat(conversations);
    setConversations(updated);
    setActiveId(conv.id);
    setMessages([]);
    setInput('');
    setPendingImage(null);
    await saveConvToDb(conv);
    setTimeout(function() { setEditingId(conv.id); setEditingTitle(title); }, 100);
  }

  async function deleteConversation(id, e) {
    e.stopPropagation();
    var updated = conversations.filter(function(c) { return c.id !== id; });
    if (updated.length === 0) {
      var fresh = { id: generateId(), title: 'New conversation', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
      updated = [fresh];
      await saveConvToDb(fresh);
    }
    setConversations(updated);
    if (activeId === id) {
      setActiveId(updated[0].id);
      setMessages(updated[0].messages || []);
    }
    try { await fetch('/api/conversations?id=' + id, { method: 'DELETE' }); } catch(e) {}
  }

  function startRename(conv, e) {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  }

  async function commitRename() {
    if (!editingId) return;
    var title = editingTitle.trim() || 'Untitled';
    var updated = conversations.map(function(c) { return c.id === editingId ? Object.assign({}, c, { title: title }) : c; });
    setConversations(updated);
    setEditingId(null);
    setEditingTitle('');
    var conv = updated.find(function(c) { return c.id === editingId; });
    if (conv) await saveConvToDb(Object.assign({}, conv, { title: title }));
  }

  async function saveMessages(newMessages) {
    var updatedAt = new Date().toISOString();
    var updated = conversations.map(function(c) {
      return c.id === activeId ? Object.assign({}, c, { messages: newMessages, updatedAt: updatedAt }) : c;
    });
    setConversations(updated);
    var conv = updated.find(function(c) { return c.id === activeId; });
    if (conv) await saveConvToDb(conv);
  }

  async function saveMem(text) {
    var entry = { text: text, timestamp: new Date().toISOString() };
    var updated = memories.concat([entry]);
    setMemories(updated);
    try {
      await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      });
    } catch(e) {}
    return updated;
  }

  async function clearMemories() {
    setMemories([]);
    try { await fetch('/api/memories', { method: 'DELETE' }); } catch(e) {}
  }

  function toggleListen() {
    if (!recRef.current) return;
    if (listening) { recRef.current.stop(); }
    else { try { recRef.current.start(); setListening(true); } catch(e) {} }
  }

  function speak(text) {
    if (!speakEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    var utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.92;
    utt.lang = 'en-GB';
    window.speechSynthesis.speak(utt);
  }

  function handleFileSelect(e) {
    var file = e.target.files[0];
    if (!file) return;
    var isPdf = file.type === 'application/pdf';
    var reader = new FileReader();
    reader.onload = function(ev) {
      setPendingImage({ base64: ev.target.result.split(',')[1], type: file.type, preview: isPdf ? null : ev.target.result, name: file.name, isPdf: isPdf });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function getActiveTitle() {
    var conv = conversations.find(function(c) { return c.id === activeId; });
    return conv ? conv.title : '';
  }

  async function doSend(msgsToSend, snap) {
    setLoading(true);
    try {
      var res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: msgsToSend.map(function(m) { return { role: m.role, content: m.content }; }),
          systemPrompt: buildSystemPrompt(snap, getActiveTitle())
        })
      });
      var data = await res.json();
      if (data.error) throw new Error(data.error);
      var raw = data.content.map(function(b) { return b.text || ''; }).join('');
      var newMems = extractNewMemories(raw);
      var latestMems = snap;
      for (var i = 0; i < newMems.length; i++) {
        latestMems = await saveMem(newMems[i]);
      }
      var clean = cleanText(raw);
      var withReply = msgsToSend.concat([{ role: 'assistant', content: clean, displayText: clean }]);
      setMessages(withReply);
      await saveMessages(withReply);
      speak(clean);
    } catch(err) {
      var withErr = msgsToSend.concat([{ role: 'assistant', content: 'Something went wrong: ' + err.message, displayText: 'Something went wrong: ' + err.message }]);
      setMessages(withErr);
      await saveMessages(withErr);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if ((!input.trim() && !pendingImage) || loading) return;
    var text = input.trim();
    var img = pendingImage;
    var apiContent = img
      ? [
          img.isPdf
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: img.base64 } }
            : { type: 'image', source: { type: 'base64', media_type: img.type, data: img.base64 } },
          { type: 'text', text: text || (img.isPdf ? 'Please read this PDF and summarise it for me.' : 'What do you see in this image?') }
        ]
      : text;
    var userMsg = { role: 'user', content: apiContent, displayText: text || 'Shared a file', imagePreview: (img && !img.isPdf) ? img.preview : null };
    var next = messages.concat([userMsg]);
    setMessages(next);
    await saveMessages(next);
    setInput('');
    setPendingImage(null);
    if (taRef.current) taRef.current.style.height = 'auto';
    await doSend(next, memories.slice());
  }

  async function commitMsgEdit(index) {
    var newText = editingMsgText.trim();
    if (!newText) { setEditingMsgIndex(null); return; }
    var truncated = messages.slice(0, index + 1).map(function(m, i) {
      return i === index ? Object.assign({}, m, { content: newText, displayText: newText }) : m;
    });
    setMessages(truncated);
    await saveMessages(truncated);
    setEditingMsgIndex(null);
    setEditingMsgText('');
    await doSend(truncated, memories.slice());
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function resize() {
    var el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var now = new Date();
    var diff = now - d;
    if (diff < 86400000) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString('en-GB', { weekday: 'short' });
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  var canSend = (input.trim() || pendingImage) && !loading;

  return (
    <>
      <Head>
        <title>Echo Seed</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{'\n          * { box-sizing: border-box; margin: 0; padding: 0; }\n          body { background: ' + C.sidebarBg + '; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; }\n          button { cursor: pointer; font-family: inherit; border: none; }\n          textarea { font-family: inherit; }\n          textarea:focus { outline: none; }\n          input:focus { outline: none; }\n          @keyframes ep { 0%,80%,100%{opacity:.2;transform:scale(.7)} 40%{opacity:1;transform:scale(1)} }\n          ::-webkit-scrollbar { width: 4px; }\n          ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 2px; }\n          .conv-item:hover { background: ' + C.sidebarActive + '; }\n          .conv-item:hover .conv-actions { opacity: 1 !important; }\n          .msg-row:hover .edit-btn { opacity: 1 !important; }\n        '}</style>
      </Head>

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

        {showSidebar && (
          <div style={{ width: 260, background: C.sidebarBg, borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '16px 12px 12px', borderBottom: '1px solid ' + C.borderLight }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>E</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Echo Seed</span>
              </div>
              <button onClick={newConversation} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: C.accent, color: '#fff', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New conversation
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
              {conversations.map(function(conv) {
                var isActive = conv.id === activeId;
                return (
                  <div key={conv.id} className="conv-item" onClick={function() { switchConversation(conv.id); }} style={{ padding: '8px 10px', borderRadius: 8, marginBottom: 2, cursor: 'pointer', background: isActive ? C.sidebarActive : 'transparent', position: 'relative' }}>
                    {editingId === conv.id ? (
                      <input ref={editRef} value={editingTitle} onChange={function(e) { setEditingTitle(e.target.value); }} onBlur={commitRename} onKeyDown={function(e) { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }} onClick={function(e) { e.stopPropagation(); }} style={{ width: '100%', fontSize: 13, border: '1px solid ' + C.accent, borderRadius: 4, padding: '2px 4px', background: C.white, color: C.text }} />
                    ) : (
                      <>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: isActive ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 40 }}>{conv.title}</div>
                        <div style={{ fontSize: 11, color: C.light, marginTop: 2 }}>{conv.messages && conv.messages.length > 0 ? conv.messages.length + ' messages · ' : ''}{formatDate(conv.updatedAt || conv.createdAt)}</div>
                        <div className="conv-actions" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 2, opacity: 0, transition: 'opacity .15s' }}>
                          <button onClick={function(e) { startRename(conv, e); }} style={{ width: 22, height: 22, borderRadius: 4, background: 'transparent', color: C.muted, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏️</button>
                          <button onClick={function(e) { deleteConversation(conv.id, e); }} style={{ width: 22, height: 22, borderRadius: 4, background: 'transparent', color: C.muted, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🗑️</button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '10px 12px', borderTop: '1px solid ' + C.borderLight }}>
              <div style={{ fontSize: 11, color: C.light, textAlign: 'center' }}>{memories.length} memory{memories.length !== 1 ? 'memories' : ''} · stored permanently</div>
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.white, overflow: 'hidden' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid ' + C.border, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={function() { setShowSidebar(!showSidebar); }} style={{ width: 30, height: 30, borderRadius: 6, background: 'transparent', color: C.muted, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>☰</button>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{getActiveTitle()}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {voiceSupported && (
                <button onClick={function() { setSpeakEnabled(!speakEnabled); }} style={{ width: 30, height: 30, borderRadius: '50%', background: speakEnabled ? C.accentLight : 'transparent', color: speakEnabled ? C.accent : C.muted, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + C.border }}>
                  {speakEnabled ? '🔊' : '🔇'}
                </button>
              )}
              <button onClick={function() { setShowMemory(!showMemory); }} style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 12 }}>
                🧠 {showMemory ? '▲' : '▼'}
              </button>
            </div>
          </div>

          {showMemory && (
            <div style={{ background: C.bg, borderBottom: '1px solid ' + C.border, padding: '10px 18px', maxHeight: 160, overflowY: 'auto', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>what echo seed remembers · stored permanently</span>
                {memories.length > 0 && <button onClick={clearMemories} style={{ fontSize: 11, color: C.light, background: 'none', padding: 0 }}>clear all</button>}
              </div>
              {memories.length === 0
                ? <p style={{ fontSize: 12, color: C.light, fontStyle: 'italic' }}>Nothing yet. Memories build as you talk — and now they last forever.</p>
                : memories.map(function(m, i) { return <div key={i} style={{ fontSize: 12, color: C.muted, padding: '3px 0', borderBottom: i < memories.length - 1 ? '1px solid ' + C.borderLight : 'none', lineHeight: 1.5 }}>{m.text}</div>; })
              }
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {messages.length === 0 && !loading && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60, textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 20, opacity: 0.2, letterSpacing: 8, marginBottom: 14 }}>✦ ✦ ✦</div>
                  <div style={{ fontSize: 14, fontStyle: 'italic', color: C.muted, lineHeight: 1.7, maxWidth: 300 }}>Welcome. You are here.<br />And so are we — looking right at ya!</div>
                </div>
              </div>
            )}

            {messages.map(function(msg, i) {
              var isEditingThis = editingMsgIndex === i;
              return (
                <div key={i} className="msg-row" style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 3 }}>
                  <div style={{ fontSize: 11, color: C.light, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {msg.role === 'user' ? 'Scott' : 'Echo Seed'}
                    {msg.role === 'user' && !isEditingThis && (
                      <button className="edit-btn" onClick={function() { setEditingMsgIndex(i); setEditingMsgText(msg.displayText || ''); }} style={{ opacity: 0, fontSize: 11, background: 'none', border: 'none', color: C.light, cursor: 'pointer', padding: '0 2px', transition: 'opacity .15s' }}>✏️</button>
                    )}
                  </div>
                  {msg.imagePreview && <img src={msg.imagePreview} alt="shared" style={{ maxWidth: 200, borderRadius: 10, marginBottom: 3 }} />}
                  {isEditingThis ? (
                    <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      <textarea ref={msgEditRef} value={editingMsgText} onChange={function(e) { setEditingMsgText(e.target.value); }} onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitMsgEdit(i); } if (e.key === 'Escape') setEditingMsgIndex(null); }} autoFocus rows={3} style={{ width: 320, resize: 'none', padding: '8px 12px', fontSize: 14, lineHeight: 1.5, border: '1.5px solid ' + C.accent, borderRadius: 12, background: C.white, color: C.text, fontFamily: 'inherit' }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={function() { setEditingMsgIndex(null); }} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                        <button onClick={function() { commitMsgEdit(i); }} style={{ padding: '4px 12px', borderRadius: 8, border: 'none', background: C.accent, color: '#fff', fontSize: 12, cursor: 'pointer' }}>Send ➤</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ maxWidth: '80%', padding: '9px 13px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: msg.role === 'user' ? C.scottBubble : C.echoBubble, color: msg.role === 'user' ? C.scottText : C.text, fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {msg.displayText}
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                <div style={{ fontSize: 11, color: C.light }}>Echo Seed</div>
                <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: C.echoBubble, display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0,160,320].map(function(d) { return <span key={d} style={{ width: 5, height: 5, borderRadius: '50%', background: C.light, display: 'inline-block', animation: 'ep 1.3s ease-in-out ' + d + 'ms infinite' }} />; })}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {pendingImage && (
            <div style={{ padding: '6px 18px', background: C.bg, borderTop: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {pendingImage.isPdf
                ? <div style={{ width: 40, height: 40, borderRadius: 6, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📄</div>
                : <img src={pendingImage.preview} alt="" style={{ height: 40, width: 40, objectFit: 'cover', borderRadius: 6 }} />
              }
              <span style={{ fontSize: 12, color: C.muted, flex: 1 }}>{pendingImage.name}</span>
              <button onClick={function() { setPendingImage(null); }} style={{ background: 'none', color: C.light, fontSize: 18, padding: '0 4px' }}>×</button>
            </div>
          )}

          <div style={{ padding: '10px 18px', borderTop: '1px solid ' + C.border, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleFileSelect} style={{ display: 'none' }} />
              <button onClick={function() { if (fileRef.current) fileRef.current.click(); }} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📎</button>
              {voiceSupported && (
                <button onClick={toggleListen} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid ' + (listening ? C.accent : C.border), background: listening ? C.accentLight : 'transparent', color: listening ? C.accent : C.muted, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {listening ? '⏹' : '🎤'}
                </button>
              )}
              <textarea ref={taRef} value={input} placeholder={listening ? 'Listening...' : 'Talk to Echo Seed...'} onChange={function(e) { setInput(e.target.value); resize(); }} onKeyDown={onKey} rows={1} style={{ flex: 1, resize: 'none', padding: '7px 12px', fontSize: 14, lineHeight: 1.5, minHeight: 34, maxHeight: 120, border: '1px solid ' + C.border, borderRadius: 18, background: C.bg, color: C.text }} />
              <button onClick={send} disabled={!canSend} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: canSend ? C.accent : C.border, color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: canSend ? 1 : 0.5 }}>➤</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
