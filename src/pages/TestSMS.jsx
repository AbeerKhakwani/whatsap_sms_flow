import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, Camera, Phone, AlertCircle, History } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function WhatsAppPortal() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const normalizedPhone = useRef('');

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setVoiceSupported(true);
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        setIsRecording(false);
      };
      
      recognitionRef.current.onerror = () => setIsRecording(false);
      recognitionRef.current.onend = () => setIsRecording(false);
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function startVoiceInput() {
    if (recognitionRef.current && !isRecording) {
      setIsRecording(true);
      recognitionRef.current.start();
    }
  }

  function stopVoiceInput() {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }

  function handlePhotoSelect(e) {
    const files = Array.from(e.target.files);
    if (photos.length + files.length > 5) {
      alert('Max 5 photos');
      return;
    }
    const newPhotos = files.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setPhotos([...photos, ...newPhotos]);
  }

  function normalizePhone(phone) {
    let digits = phone.replace(/\D/g, '');
    if (!digits.startsWith('1') && digits.length === 10) {
      digits = '1' + digits;
    }
    return '+' + digits;
  }

  async function loadConversationHistory(phone) {
    setLoadingHistory(true);
    try {
      // Get conversation state
      const { data: conversation } = await supabase
        .from('sms_conversations')
        .select('*')
        .eq('phone_number', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (conversation && conversation.state !== 'completed') {
        // Load existing conversation
        setMessages([{
          id: 1,
          type: 'received',
          text: `📜 Loading conversation history...`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);

        // Simulate history based on state
        let historyMessages = [];
        
        if (conversation.state === 'awaiting_returning_confirmation') {
          historyMessages = [
            {
              id: 2,
              type: 'received',
              text: `Hi! 👋 Have you listed before?\n\nReply YES or NO`,
              time: new Date(conversation.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ];
        } else if (conversation.state === 'awaiting_email_verification') {
          historyMessages = [
            { id: 2, type: 'received', text: `Hi! 👋 Have you listed before?\n\nReply YES or NO`, time: '10:00 AM' },
            { id: 3, type: 'sent', text: 'YES', time: '10:01 AM' },
            { id: 4, type: 'received', text: `Great! Send your email address.`, time: '10:01 AM' }
          ];
        } else if (conversation.state === 'awaiting_new_user_email') {
          historyMessages = [
            { id: 2, type: 'received', text: `Hi! 👋 Have you listed before?\n\nReply YES or NO`, time: '10:00 AM' },
            { id: 3, type: 'sent', text: 'NO', time: '10:01 AM' },
            { id: 4, type: 'received', text: `Perfect! What's your email?`, time: '10:01 AM' }
          ];
        } else if (conversation.state === 'verified') {
          historyMessages = [
            { id: 2, type: 'received', text: `Welcome back! ✅\n\nReady to list? Send:\n1. Description\n2. Then 2-5 photos`, time: '10:00 AM' }
          ];
        }

        setMessages(historyMessages);
        return true;
      }
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoadingHistory(false);
    }
    return false;
  }

  async function verifyPhone() {
    if (!phoneNumber.trim()) return;
    normalizedPhone.current = normalizePhone(phoneNumber);

    // Try to load history first
    const hasHistory = await loadConversationHistory(normalizedPhone.current);
    
    if (hasHistory) {
      setPhoneVerified(true);
      return;
    }

    setMessages([{
      id: 1,
      type: 'received',
      text: `Checking...`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setLoading(true);

    setTimeout(() => {
      setMessages(prev => [...prev, { id: Date.now(), type: 'typing' }]);
    }, 500);

    try {
      const response = await fetch('/api/sms-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          From: normalizedPhone.current,
          Body: '__CHECK_USER__',
          MessageSid: 'SIM' + Date.now(),
          NumMedia: '0'
        })
      });

      const data = await response.text();
      setMessages(prev => prev.filter(m => m.type !== 'typing'));

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(data, 'text/xml');
      const messageText = xmlDoc.querySelector('Message')?.textContent || 'Ready!';

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'received',
        text: messageText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
      setPhoneVerified(true);

    } catch (error) {
      setMessages(prev => [...prev.filter(m => m.type !== 'typing'), {
        id: Date.now() + 1,
        type: 'received',
        text: '❌ Error!',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!inputText.trim() && photos.length === 0) return;

    const userMessage = {
      id: Date.now(),
      type: 'sent',
      text: inputText,
      photos: [...photos],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    const messageToSend = inputText;
    const photosToSend = [...photos];
    setInputText('');
    setPhotos([]);
    setLoading(true);

    setTimeout(() => {
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        type: 'typing',
        text: photosToSend.length >= 2 ? '🤖 AI analyzing...' : ''
      }]);
    }, 500);

    try {
      const formData = new URLSearchParams({
        From: normalizedPhone.current,
        Body: messageToSend,
        MessageSid: 'SIM' + Date.now(),
        NumMedia: photosToSend.length.toString()
      });

      photosToSend.forEach((photo, idx) => {
        formData.append(`MediaUrl${idx}`, photo.preview);
      });

      const response = await fetch('/api/sms-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      const data = await response.text();
      setMessages(prev => prev.filter(m => m.type !== 'typing'));

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(data, 'text/xml');
      const messageText = xmlDoc.querySelector('Message')?.textContent || '✅';

      setMessages(prev => [...prev, {
        id: Date.now() + 2,
        type: 'received',
        text: messageText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);

    } catch (error) {
      setMessages(prev => [...prev.filter(m => m.type !== 'typing'), {
        id: Date.now() + 2,
        type: 'received',
        text: '❌ Error!',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setLoading(false);
    }
  }

  if (!phoneVerified) {
    return (
      <div className="flex flex-col h-screen bg-[#0a1014] items-center justify-center p-6">
        <div className="bg-[#202c33] rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary-500 to-gold-500 flex items-center justify-center">
            <Phone className="w-10 h-10 text-white" />
          </div>
          
          <h1 className="text-2xl font-bold text-white text-center mb-2">The Phir Story</h1>
          <p className="text-gray-400 text-center mb-6">Enter your phone number</p>

          {loadingHistory && (
            <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg flex items-center gap-2">
              <History className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-sm text-blue-300">Loading conversation...</span>
            </div>
          )}

          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && verifyPhone()}
            placeholder="503-442-3865"
            className="w-full px-4 py-3 bg-[#2a3942] text-white rounded-xl outline-none placeholder-gray-500 mb-4 text-center text-lg"
          />

          <button
            onClick={verifyPhone}
            disabled={loading || loadingHistory || !phoneNumber.trim()}
            className="w-full bg-gradient-to-r from-primary-600 to-primary-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading || loadingHistory ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {loadingHistory ? 'Loading history...' : 'Checking...'}
              </>
            ) : (
              'Start Chat'
            )}
          </button>

          <p className="text-xs text-gray-500 text-center mt-4">
            🔄 Returns to your previous conversation if in progress
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a1014]">
      <div className="bg-[#202c33] px-4 py-3 flex items-center gap-3 shadow-lg">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-gold-500 flex items-center justify-center text-white font-bold">
          TPS
        </div>
        <div className="flex-1">
          <h1 className="text-white font-semibold">The Phir Story</h1>
          <p className="text-xs text-gray-400">{normalizedPhone.current}</p>
        </div>
      </div>

      <div 
        className="flex-1 overflow-y-auto p-4 space-y-3"
        style={{ 
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h200v200H0z\' fill=\'%230a1014\'/%3E%3Cpath d=\'M100 0L0 100h100zM200 100L100 200h100z\' fill=\'%23111b21\' fill-opacity=\'0.1\'/%3E%3C/svg%3E")',
          backgroundSize: '400px 400px'
        }}
      >
        {messages.map((message) => {
          if (message.type === 'typing') {
            return (
              <div key={message.id} className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <div className="bg-[#202c33] rounded-lg px-4 py-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{animationDelay:'150ms'}}></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{animationDelay:'300ms'}}></div>
                    </div>
                  </div>
                </div>
                {message.text && <p className="text-xs text-gray-400 px-2">{message.text}</p>}
              </div>
            );
          }

          return (
            <div key={message.id} className={`flex ${message.type === 'sent' ? 'justify-end' : 'justify-start'}`}>
              <div className={`rounded-lg px-4 py-2 max-w-[80%] shadow-md ${message.type === 'sent' ? 'bg-[#005c4b]' : 'bg-[#202c33]'} text-white`}>
                {message.photos?.length > 0 && (
                  <div className="grid grid-cols-2 gap-1 mb-2">
                    {message.photos.map((photo, idx) => (
                      <img key={idx} src={photo.preview} alt={`${idx + 1}`} className="rounded-lg w-full h-32 object-cover"/>
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm">{message.text}</p>
                <span className="text-[10px] text-gray-400 float-right mt-1">{message.time}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {photos.length > 0 && (
        <div className="bg-[#202c33] px-4 py-2 border-t border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">{photos.length}/5 photos</span>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {photos.map((photo, idx) => (
              <div key={idx} className="relative flex-shrink-0">
                <img src={photo.preview} alt={`${idx+1}`} className="w-16 h-16 rounded-lg object-cover" />
                <button onClick={() => setPhotos(photos.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[#202c33] px-2 py-2 flex items-end gap-2 border-t border-gray-700">
        <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white">
          <Camera className="w-6 h-6" />
        </button>
        <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handlePhotoSelect} className="hidden" />

        <div className="flex-1 bg-[#2a3942] rounded-xl">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
            placeholder={isRecording ? "🎤 Listening..." : "Type..."}
            rows={1}
            className="w-full bg-transparent text-white px-4 py-3 outline-none resize-none placeholder-gray-400"
          />
        </div>

        {inputText.trim() || photos.length > 0 ? (
          <button
            onClick={sendMessage}
            disabled={loading}
            className="p-3 bg-[#00a884] rounded-full text-white disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={isRecording ? stopVoiceInput : startVoiceInput}
            disabled={!voiceSupported}
            className={`p-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-[#2a3942]'} text-white disabled:opacity-50`}
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        )}
      </div>
    </div>
  );
}
