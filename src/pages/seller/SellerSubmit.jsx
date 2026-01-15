import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mic, MicOff, Camera, Send, X, CheckCircle, Loader2, ArrowLeft, Video, Image, Tag, RotateCcw, Home, Plus, LogOut, MapPin } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

// Required photo types with guidance
const REQUIRED_PHOTOS = [
  { id: 'front', label: 'Front View', hint: 'Full outfit from front, good lighting' },
  { id: 'back', label: 'Back View', hint: 'Full outfit from back' },
  { id: 'tag', label: 'Tag/Label', hint: 'Designer label or care tag' },
];

// Dropdown options with keywords for auto-matching
const PIECES_OPTIONS = [
  { value: '', label: 'Select...', keywords: [] },
  { value: 'Kurta', label: 'Kurta (single piece)', keywords: ['kurta', 'kameez', 'single', '1 piece', '1-piece', 'one piece'] },
  { value: '2-piece', label: '2-Piece (shirt + pants/dupatta)', keywords: ['2 piece', '2-piece', 'two piece', 'shirt pants', 'shirt trouser'] },
  { value: '3-piece', label: '3-Piece (shirt + pants + dupatta)', keywords: ['3 piece', '3-piece', 'three piece', 'suit', 'complete'] },
  { value: 'Lehnga Set', label: 'Lehnga Set', keywords: ['lehnga', 'lehenga', 'lengha', 'choli'] },
  { value: 'Saree', label: 'Saree (with blouse)', keywords: ['saree', 'sari', 'saaree'] },
  { value: 'Sharara Set', label: 'Sharara Set', keywords: ['sharara'] },
  { value: 'Gharara Set', label: 'Gharara Set', keywords: ['gharara'] },
  { value: 'Anarkali', label: 'Anarkali', keywords: ['anarkali', 'frock'] },
  { value: 'Maxi', label: 'Maxi/Gown', keywords: ['maxi', 'gown', 'dress'] },
  { value: 'Other', label: 'Other', keywords: [] },
];

const STYLE_OPTIONS = [
  { value: '', label: 'Select...', keywords: [] },
  { value: 'Formal', label: 'Formal/Wedding Guest', keywords: ['formal', 'wedding', 'guest', 'shaadi', 'mehndi'] },
  { value: 'Bridal', label: 'Bridal', keywords: ['bridal', 'bride', 'dulhan', 'baraat', 'walima'] },
  { value: 'Party Wear', label: 'Party Wear', keywords: ['party', 'evening', 'night'] },
  { value: 'Casual', label: 'Casual/Daily Wear', keywords: ['casual', 'daily', 'everyday', 'simple', 'plain'] },
  { value: 'Traditional', label: 'Traditional/Eid', keywords: ['traditional', 'eid', 'classic', 'desi'] },
  { value: 'Semi-Formal', label: 'Semi-Formal', keywords: ['semi-formal', 'semi formal', 'lunch', 'daytime'] },
  { value: 'Festive', label: 'Festive', keywords: ['festive', 'festival', 'celebration'] },
  { value: 'Other', label: 'Other', keywords: [] },
];

const SIZE_OPTIONS = [
  { value: '', label: 'Select...', keywords: [] },
  { value: 'XS', label: 'XS', keywords: ['xs', 'extra small', 'xsmall'] },
  { value: 'S', label: 'S (Small)', keywords: ['s', 'small', 'sm'] },
  { value: 'M', label: 'M (Medium)', keywords: ['m', 'medium', 'med'] },
  { value: 'L', label: 'L (Large)', keywords: ['l', 'large', 'lg'] },
  { value: 'XL', label: 'XL', keywords: ['xl', 'extra large', 'xlarge'] },
  { value: 'XXL', label: 'XXL', keywords: ['xxl', '2xl', 'double xl'] },
  { value: 'One Size', label: 'One Size', keywords: ['one size', 'free size', 'fits all'] },
  { value: 'Unstitched', label: 'Unstitched', keywords: ['unstitched', 'not stitched', 'fabric only'] },
];

const CONDITION_OPTIONS = [
  { value: '', label: 'Select...', keywords: [] },
  { value: 'New with tags', label: 'New with tags', keywords: ['new with tags', 'nwt', 'brand new', 'never worn', 'tags attached'] },
  { value: 'Like new', label: 'Like new', keywords: ['like new', 'worn once', 'excellent', 'perfect condition', 'mint'] },
  { value: 'Excellent', label: 'Excellent', keywords: ['excellent', 'great condition', 'barely worn'] },
  { value: 'Good', label: 'Good', keywords: ['good', 'good condition', 'worn few times', 'gently used'] },
  { value: 'Fair', label: 'Fair', keywords: ['fair', 'used', 'some wear', 'visible wear'] },
];

// Helper to match extracted text to dropdown value
function matchToDropdown(text, options) {
  if (!text) return '';
  const lowerText = text.toLowerCase().trim();

  // Direct match first
  for (const opt of options) {
    if (opt.value && opt.value.toLowerCase() === lowerText) {
      return opt.value;
    }
  }

  // Keyword match
  for (const opt of options) {
    if (opt.keywords?.some(kw => lowerText.includes(kw))) {
      return opt.value;
    }
  }

  return '';
}

export default function SellerSubmit() {
  const navigate = useNavigate();
  const [seller, setSeller] = useState(null);
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [inputMode, setInputMode] = useState('voice');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [processingCount, setProcessingCount] = useState(0);
  const [submitError, setSubmitError] = useState(null); // { message: string, issues: array }

  // Address state for existing users without address
  const [hasAddress, setHasAddress] = useState(null); // null = loading, true/false = has/doesn't have
  const [savingAddress, setSavingAddress] = useState(false);
  const [shippingAddress, setShippingAddress] = useState({
    full_name: '',
    street_address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'USA'
  });

  // Form fields
  const [formData, setFormData] = useState({
    designer: '',
    pieces: '',
    piecesOther: '', // For "Other" option
    style: '',
    styleOther: '',
    size: '',
    color: '',
    material: '',
    condition: '',
    original_price: '',
    asking_price: '',
    additional_details: ''
  });

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  useEffect(() => {
    const storedEmail = localStorage.getItem('seller_email');
    if (!storedEmail) {
      navigate('/seller/login');
      return;
    }
    setSeller({ email: storedEmail });

    // Fetch seller profile to check if they have an address
    async function fetchProfile() {
      try {
        const res = await fetch(`${API_URL}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-profile', email: storedEmail })
        });
        const data = await res.json();
        if (data.success) {
          setHasAddress(data.seller.has_address);
        } else {
          setHasAddress(false);
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
        setHasAddress(false);
      }
    }
    fetchProfile();
  }, [navigate]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  async function transcribeAudio(audioBlob) {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64Audio })
        });

        const data = await response.json();
        if (data.text) {
          const newDescription = description + (description ? ' ' : '') + data.text;
          setDescription(newDescription);
          setIsTranscribing(false);
          await analyzeWithText(newDescription);
        } else {
          alert('Could not transcribe audio. Please try again or type instead.');
          setIsTranscribing(false);
        }
      };
    } catch (error) {
      console.error('Transcription error:', error);
      alert('Transcription failed. Please try again.');
      setIsTranscribing(false);
    }
  }

  async function analyzeWithText(text) {
    if (!text.trim()) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/validate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: text })
      });

      const data = await response.json();
      const extracted = data.extracted || {};

      // Smart matching for dropdowns
      const matchedPieces = matchToDropdown(extracted.pieces || extracted.item_type || text, PIECES_OPTIONS);
      const matchedStyle = matchToDropdown(extracted.style || text, STYLE_OPTIONS);
      const matchedSize = matchToDropdown(extracted.size, SIZE_OPTIONS);
      const matchedCondition = matchToDropdown(extracted.condition, CONDITION_OPTIONS);

      setFormData(prev => ({
        ...prev,
        designer: extracted.designer || '',
        pieces: matchedPieces,
        style: matchedStyle,
        size: matchedSize,
        color: extracted.color || '',
        material: extracted.material || '',
        condition: matchedCondition,
        original_price: extracted.original_price?.toString() || '',
        asking_price: extracted.asking_price?.toString() || '',
        additional_details: text
      }));

      setStep(2);
    } catch (error) {
      console.error('Analysis error:', error);
      alert('Could not analyze. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function analyzeDescription() {
    if (!description.trim()) {
      alert('Please describe your item first!');
      return;
    }
    await analyzeWithText(description);
  }

  // Convert and compress image
  async function processImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          const maxSize = 1500;
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height * maxSize) / width;
              width = maxSize;
            } else {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) {
              const processedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                type: 'image/jpeg'
              });
              resolve(processedFile);
            } else {
              reject(new Error('Processing failed'));
            }
          }, 'image/jpeg', 0.85);
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function addPhotos(files) {
    const imageFiles = Array.from(files).filter(f =>
      f.type.startsWith('image/') ||
      f.name.toLowerCase().endsWith('.heic') ||
      f.name.toLowerCase().endsWith('.heif')
    );

    if (photos.length + imageFiles.length > 10) {
      setSubmitError({ message: 'Maximum 10 photos allowed', issues: [] });
      return;
    }

    // Clear any previous error when adding photos
    if (submitError) setSubmitError(null);

    // Show processing count immediately
    setProcessingCount(imageFiles.length);

    for (const file of imageFiles) {
      try {
        const processedFile = await processImage(file);
        const preview = URL.createObjectURL(processedFile);
        setPhotos(prev => [...prev, { file: processedFile, preview, originalName: file.name }]);
        setProcessingCount(prev => prev - 1);
      } catch (err) {
        console.error('Error processing image:', err);
        setProcessingCount(prev => prev - 1);
      }
    }
  }

  function handlePhotoSelect(e) {
    if (e.target.files?.length) {
      addPhotos(e.target.files);
    }
    e.target.value = '';
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files) {
      addPhotos(e.dataTransfer.files);
    }
  }

  function removePhoto(index) {
    setPhotos(photos.filter((_, i) => i !== index));
  }

  function handleVideoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert('Video must be under 50MB. Please use a shorter clip.');
      return;
    }

    setVideo({
      file,
      preview: URL.createObjectURL(file),
      name: file.name
    });
    e.target.value = '';
  }

  function removeVideo() {
    setVideo(null);
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          const maxSize = 1200;
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height * maxSize) / width;
              width = maxSize;
            } else {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
          resolve(base64);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function isFormComplete() {
    const piecesValid = formData.pieces && (formData.pieces !== 'Other' || formData.piecesOther);
    const styleValid = formData.style && (formData.style !== 'Other' || formData.styleOther);
    return formData.designer && piecesValid && styleValid &&
           formData.size && formData.condition && formData.asking_price;
  }

  const MIN_PHOTOS = 3;
  const hasEnoughPhotos = photos.length >= MIN_PHOTOS;

  // Check if shipping address form is valid
  function isAddressValid() {
    return shippingAddress.street_address && shippingAddress.city &&
           shippingAddress.state && shippingAddress.postal_code;
  }

  // Save shipping address
  async function handleSaveAddress() {
    if (!isAddressValid()) {
      setSubmitError({ message: 'Please fill in all address fields', issues: [] });
      return;
    }

    setSavingAddress(true);
    setSubmitError(null);

    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-address',
          email: seller?.email,
          shipping_address: shippingAddress
        })
      });

      const data = await res.json();
      if (data.success) {
        setHasAddress(true);
      } else {
        setSubmitError({ message: data.error || 'Failed to save address', issues: [] });
      }
    } catch (err) {
      console.error('Failed to save address:', err);
      setSubmitError({ message: 'Failed to save address', issues: [] });
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleSubmit() {
    // Clear any previous errors
    setSubmitError(null);

    if (!isFormComplete()) {
      setSubmitError({ message: 'Please fill in all required fields', issues: [] });
      return;
    }

    if (!hasEnoughPhotos) {
      setSubmitError({
        message: `Please add at least ${MIN_PHOTOS} photos: front view, back view, and tag/label`,
        issues: []
      });
      return;
    }

    setIsSubmitting(true);
    setUploadProgress('Creating listing...');

    try {
      const finalPieces = formData.pieces === 'Other' ? formData.piecesOther : formData.pieces;
      const finalStyle = formData.style === 'Other' ? formData.styleOther : formData.style;

      const draftResponse = await fetch('/api/create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: seller?.email,
          description: formData.additional_details,
          extracted: {
            designer: formData.designer,
            pieces: finalPieces,
            style: finalStyle,
            item_type: `${finalPieces} - ${finalStyle}`,
            size: formData.size,
            color: formData.color,
            material: formData.material,
            condition: formData.condition,
            original_price: formData.original_price,
            asking_price: formData.asking_price
          }
        })
      });

      const draftData = await draftResponse.json();

      if (!draftData.success) {
        setSubmitError({
          message: draftData.error || 'Failed to create listing',
          issues: draftData.issues || []
        });
        setUploadProgress('');
        setIsSubmitting(false);
        return;
      }

      const productId = draftData.productId;
      let uploadedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < photos.length; i++) {
        setUploadProgress(`Uploading photo ${i + 1} of ${photos.length}...`);
        const photo = photos[i];

        try {
          const base64 = await fileToBase64(photo.file);

          const uploadRes = await fetch('/api/product-image?action=add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId,
              base64,
              filename: photo.originalName || `photo-${i + 1}.jpg`
            })
          });

          const uploadData = await uploadRes.json();
          if (uploadData.success) {
            uploadedCount++;
          } else {
            console.error(`Photo ${i + 1} failed:`, uploadData);
            failedCount++;
          }
        } catch (photoError) {
          console.error(`Photo ${i + 1} error:`, photoError);
          failedCount++;
        }
      }

      if (video) {
        setUploadProgress('Processing video...');
        // Video handling placeholder
        console.log('Video would be uploaded:', video.name);
      }

      if (failedCount > 0 && uploadedCount === 0) {
        setSubmitError({
          message: 'Failed to upload photos. Please try again.',
          issues: []
        });
        setUploadProgress('');
        setIsSubmitting(false);
        return;
      }

      setUploadProgress('');
      setSubmitted(true);
    } catch (error) {
      console.error('Submit error:', error);
      setSubmitError({
        message: 'Something went wrong. Please try again.',
        issues: []
      });
      setUploadProgress('');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Clear error when form data changes
  function handleFormChange(field, value) {
    setFormData({ ...formData, [field]: value });
    if (submitError) setSubmitError(null);
  }

  if (!seller) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Submitted!</h1>
          <p className="text-gray-600 mb-6">
            Your listing is under review. We'll notify you via WhatsApp once it's live!
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/seller')}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Dashboard
            </button>
            <button
              onClick={() => {
                setSubmitted(false);
                setStep(1);
                setDescription('');
                setPhotos([]);
                setVideo(null);
                setSubmitError(null);
                setFormData({
                  designer: '', pieces: '', piecesOther: '', style: '', styleOther: '',
                  size: '', color: '', material: '', condition: '',
                  original_price: '', asking_price: '', additional_details: ''
                });
              }}
              className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-green-700"
            >
              List Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => step === 1 ? navigate('/') : setStep(step - 1)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-medium text-gray-900">List Your Item</h1>
            <p className="text-sm text-gray-500">
              {step === 1 && 'Step 1: Describe'}
              {step === 2 && 'Step 2: Details'}
              {step === 3 && 'Step 3: Photos'}
            </p>
          </div>
          <img src="/logo.svg" alt="" className="h-6 md:hidden opacity-60" />
        </div>
      </header>

      {/* Bottom Nav - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-50 safe-area-pb">
        <div className="flex items-center justify-around py-2">
          <Link to="/" className="flex flex-col items-center py-2 px-4 text-gray-500">
            <Home className="w-6 h-6" />
            <span className="text-xs mt-1">Home</span>
          </Link>
          <div className="flex flex-col items-center py-2 px-6 -mt-4 bg-[#C91A2B] text-white rounded-full shadow-lg">
            <Plus className="w-7 h-7" />
            <span className="text-xs mt-0.5 font-medium">Sell</span>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('seller_token');
              localStorage.removeItem('seller_email');
              navigate('/login');
            }}
            className="flex flex-col items-center py-2 px-4 text-gray-500"
          >
            <LogOut className="w-6 h-6" />
            <span className="text-xs mt-1">Logout</span>
          </button>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-center gap-1 mb-6 text-sm">
          <span className={`px-3 py-1 rounded-full ${step === 1 ? 'bg-green-600 text-white font-medium' : step > 1 ? 'text-green-600' : 'text-gray-400'}`}>
            Describe
          </span>
          <span className="text-gray-300">→</span>
          <span className={`px-3 py-1 rounded-full ${step === 2 ? 'bg-green-600 text-white font-medium' : step > 2 ? 'text-green-600' : 'text-gray-400'}`}>
            Review Details
          </span>
          <span className="text-gray-300">→</span>
          <span className={`px-3 py-1 rounded-full ${step === 3 ? 'bg-green-600 text-white font-medium' : 'text-gray-400'}`}>
            Add Photos
          </span>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* Step 1: Describe */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-medium text-gray-900">Describe Your Item</h2>
                <p className="text-gray-500 text-sm mt-1">Tell us about your outfit in your own words</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setInputMode('voice')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                    inputMode === 'voice'
                      ? 'bg-green-100 text-green-700 border-2 border-green-500'
                      : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                  }`}
                >
                  🎤 Voice
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                    inputMode === 'text'
                      ? 'bg-green-100 text-green-700 border-2 border-green-500'
                      : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                  }`}
                >
                  ⌨️ Type
                </button>
              </div>

              {inputMode === 'voice' ? (
                <div className="text-center py-6">
                  {(isTranscribing || isAnalyzing) ? (
                    <div className="space-y-4">
                      <Loader2 className="w-16 h-16 mx-auto text-green-600 animate-spin" />
                      <p className="text-gray-600">
                        {isTranscribing ? 'Listening...' : 'Analyzing...'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto ${
                          isRecording
                            ? 'bg-red-500 animate-pulse'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        {isRecording ? (
                          <MicOff className="w-10 h-10 text-white" />
                        ) : (
                          <Mic className="w-10 h-10 text-white" />
                        )}
                      </button>
                      <p className="mt-4 text-gray-600 font-medium">
                        {isRecording ? 'Tap to stop' : 'Tap to speak'}
                      </p>
                      <p className="text-sm text-gray-400 mt-2 max-w-xs mx-auto">
                        Example: "Maria B formal 3-piece, medium size, maroon color, like new condition, asking $120"
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Example: I have a Sana Safinaz formal 3-piece suit, size medium, maroon with gold embroidery. Worn once for a wedding, like new condition. Original price was $250, asking $95."
                  rows={5}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-none"
                />
              )}

              {description && (
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-700">{description}</p>
                </div>
              )}

              <button
                onClick={analyzeDescription}
                disabled={isAnalyzing || !description.trim()}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Review Details →'
                )}
              </button>
            </div>
          )}

          {/* Step 2: Form */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-medium text-gray-900">Confirm Details</h2>
                <p className="text-gray-500 text-sm">We've filled what we could - please complete the rest</p>
              </div>

              <div className="space-y-4">
                {/* Designer */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Designer/Brand <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.designer}
                    onChange={(e) => setFormData({ ...formData, designer: e.target.value })}
                    placeholder="e.g., Sana Safinaz, Maria B, Khaadi, Agha Noor, Elan"
                    className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none ${
                      formData.designer ? 'border-green-300 bg-green-50' : 'border-gray-300'
                    }`}
                  />
                </div>

                {/* Pieces */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What type of outfit? <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.pieces}
                    onChange={(e) => setFormData({ ...formData, pieces: e.target.value })}
                    className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none ${
                      formData.pieces ? 'border-green-300 bg-green-50' : 'border-gray-300'
                    }`}
                  >
                    {PIECES_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {formData.pieces === 'Other' && (
                    <input
                      type="text"
                      value={formData.piecesOther}
                      onChange={(e) => setFormData({ ...formData, piecesOther: e.target.value })}
                      placeholder="Please specify (e.g., Palazzo set, Dhoti suit)"
                      className="w-full mt-2 px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    />
                  )}
                </div>

                {/* Style */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Occasion/Style <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.style}
                    onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                    className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none ${
                      formData.style ? 'border-green-300 bg-green-50' : 'border-gray-300'
                    }`}
                  >
                    {STYLE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {formData.style === 'Other' && (
                    <input
                      type="text"
                      value={formData.styleOther}
                      onChange={(e) => setFormData({ ...formData, styleOther: e.target.value })}
                      placeholder="Please specify the occasion"
                      className="w-full mt-2 px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    />
                  )}
                </div>

                {/* Size + Condition Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Size <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.size}
                      onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                      className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none ${
                        formData.size ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    >
                      {SIZE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Condition <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.condition}
                      onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                      className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none ${
                        formData.condition ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    >
                      {CONDITION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Color + Material Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                    <input
                      type="text"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      placeholder="e.g., Maroon with gold"
                      className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none ${
                        formData.color ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
                    <input
                      type="text"
                      value={formData.material}
                      onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                      placeholder="e.g., Chiffon, Lawn, Silk"
                      className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none ${
                        formData.material ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    />
                  </div>
                </div>

                {/* Prices Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Original Price ($)</label>
                    <input
                      type="number"
                      value={formData.original_price}
                      onChange={(e) => setFormData({ ...formData, original_price: e.target.value })}
                      placeholder="e.g., 250"
                      className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none ${
                        formData.original_price ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Your Asking Price ($) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.asking_price}
                      onChange={(e) => setFormData({ ...formData, asking_price: e.target.value })}
                      placeholder="e.g., 95"
                      className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none ${
                        formData.asking_price ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    />
                  </div>
                </div>

                {/* Additional Details */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Any flaws or special notes?
                  </label>
                  <textarea
                    value={formData.additional_details}
                    onChange={(e) => setFormData({ ...formData, additional_details: e.target.value })}
                    placeholder="e.g., Missing one button on sleeve, minor loose thread on dupatta, beadwork intact, includes matching clutch"
                    rows={2}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none resize-none"
                  />
                </div>
              </div>

              {!isFormComplete() && (
                <p className="text-sm text-amber-600 text-center">
                  Please fill all required fields (*)
                </p>
              )}

              <button
                onClick={() => setStep(3)}
                disabled={!isFormComplete()}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Photos →
              </button>
            </div>
          )}

          {/* Step 3: Photos */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-medium text-gray-900">Add Photos</h2>
                <p className="text-gray-500 text-sm">Good photos = quick sales!</p>
              </div>

              {/* Photo Guide */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="font-medium text-amber-800 mb-2">📸 We need at least 3 photos:</p>
                <ul className="text-sm text-amber-700 space-y-1">
                  <li>1️⃣ <strong>Front</strong> - Full outfit, flat or on hanger</li>
                  <li>2️⃣ <strong>Back</strong> - Back of the outfit</li>
                  <li>3️⃣ <strong>Tag</strong> - Designer label or size tag</li>
                </ul>
                <p className="text-xs text-amber-600 mt-2">
                  💡 Bonus: Add detail shots of embroidery, dupatta, any flaws
                </p>
              </div>

              {/* Photo Upload */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => !processingCount && photoInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-4 cursor-pointer transition ${
                  processingCount ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-green-500'
                }`}
              >
                {processingCount > 0 ? (
                  <div className="py-8 text-center">
                    <Loader2 className="w-10 h-10 mx-auto text-green-600 animate-spin mb-2" />
                    <p className="text-green-700 font-medium">Processing {processingCount} photo(s)...</p>
                    <p className="text-green-600 text-sm">This may take a moment for large images</p>
                  </div>
                ) : photos.length === 0 ? (
                  <div className="py-10 text-center">
                    <Camera className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-600 font-medium">Tap to add photos</p>
                    <p className="text-gray-400 text-sm mt-1">JPG, PNG, or HEIC (iPhone)</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {photos.map((photo, idx) => (
                      <div key={idx} className="relative aspect-square">
                        <img
                          src={photo.preview}
                          alt={`Photo ${idx + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                        {idx < 3 && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs py-1 px-2 rounded-b-lg text-center">
                            {REQUIRED_PHOTOS[idx]?.label}
                          </div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {photos.length < 10 && (
                      <div className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400">
                        <Camera className="w-8 h-8 mb-1" />
                        <span className="text-xs">Add More</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <input
                ref={photoInputRef}
                type="file"
                multiple
                accept="image/*,.heic,.heif"
                onChange={handlePhotoSelect}
                className="hidden"
              />

              <p className={`text-center text-sm font-medium ${hasEnoughPhotos ? 'text-green-600' : 'text-amber-600'}`}>
                {photos.length}/10 photos {!hasEnoughPhotos && `(need ${MIN_PHOTOS - photos.length} more)`}
              </p>

              {/* Video (Optional) */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-700">Video (Optional)</p>
                    <p className="text-sm text-gray-500">Show how it flows! Max 50MB</p>
                  </div>
                  {!video && (
                    <button
                      onClick={() => videoInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:border-green-500"
                    >
                      <Video className="w-4 h-4" />
                      Add
                    </button>
                  )}
                </div>

                {video && (
                  <div className="mt-3 bg-gray-100 rounded-lg p-3 flex items-center gap-3">
                    <Video className="w-6 h-6 text-gray-500" />
                    <span className="flex-1 text-sm text-gray-700 truncate">{video.name}</span>
                    <button onClick={removeVideo} className="text-red-500">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}

                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoSelect}
                  className="hidden"
                />
              </div>

              {/* Shipping Address - only show if user doesn't have one */}
              {hasAddress === false && (
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">Shipping Address Required</h3>
                      <p className="text-sm text-gray-500">We need this to create a shipping label when your item sells</p>
                    </div>
                  </div>

                  <div className="space-y-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <input
                      type="text"
                      value={shippingAddress.full_name}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, full_name: e.target.value })}
                      placeholder="Full Name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                    />
                    <input
                      type="text"
                      value={shippingAddress.street_address}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, street_address: e.target.value })}
                      placeholder="Street Address"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={shippingAddress.city}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                        placeholder="City"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                      />
                      <input
                        type="text"
                        value={shippingAddress.state}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                        placeholder="State"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={shippingAddress.postal_code}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, postal_code: e.target.value })}
                        placeholder="ZIP Code"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                      />
                      <input
                        type="text"
                        value={shippingAddress.country}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, country: e.target.value })}
                        placeholder="Country"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                      />
                    </div>
                    <button
                      onClick={handleSaveAddress}
                      disabled={!isAddressValid() || savingAddress}
                      className="w-full bg-amber-600 text-white py-2 rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {savingAddress ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <MapPin className="w-4 h-4" />
                          Save Address
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 text-red-500">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-red-800">{submitError.message}</p>
                      {submitError.issues?.length > 0 && (
                        <ul className="mt-2 text-sm text-red-700 space-y-1">
                          {submitError.issues.map((issue, i) => (
                            <li key={i}>
                              {issue.reason || issue.issue || (typeof issue === 'string' ? issue : JSON.stringify(issue))}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        onClick={() => setSubmitError(null)}
                        className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !hasEnoughPhotos || hasAddress === false}
                className="w-full bg-green-600 text-white py-4 rounded-lg font-medium text-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {uploadProgress || 'Submitting...'}
                  </>
                ) : hasAddress === false ? (
                  <>
                    <MapPin className="w-5 h-5" />
                    Add Address First
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Submit for Review
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
