import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Camera, Send, X, CheckCircle, Loader2, ArrowLeft } from 'lucide-react';

export default function SellerSubmit() {
  const navigate = useNavigate();
  const [seller, setSeller] = useState(null);
  const [step, setStep] = useState(1); // 1: describe, 2: form, 3: photos
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [inputMode, setInputMode] = useState('voice');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Form fields
  const [formData, setFormData] = useState({
    designer: '',
    item_type: '',
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
  const fileInputRef = useRef(null);

  // Check for email
  useEffect(() => {
    const storedEmail = localStorage.getItem('seller_email');
    if (!storedEmail) {
      navigate('/seller/login');
      return;
    }
    setSeller({ email: storedEmail });
  }, [navigate]);

  // Recording functions
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

          // Auto-analyze immediately after transcription
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

  // Analyze with specific text (for auto-analyze after voice)
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

      // Pre-fill form with extracted data
      setFormData(prev => ({
        ...prev,
        designer: extracted.designer || '',
        item_type: extracted.item_type || '',
        size: extracted.size || '',
        color: extracted.color || '',
        material: extracted.material || '',
        condition: extracted.condition || '',
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

  // Analyze description and extract fields
  async function analyzeDescription() {
    if (!description.trim()) {
      alert('Please describe your item first!');
      return;
    }

    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/validate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
      });

      const data = await response.json();
      const extracted = data.extracted || {};

      // Pre-fill form with extracted data
      setFormData(prev => ({
        ...prev,
        designer: extracted.designer || '',
        item_type: extracted.item_type || '',
        size: extracted.size || '',
        color: extracted.color || '',
        material: extracted.material || '',
        condition: extracted.condition || '',
        original_price: extracted.original_price?.toString() || '',
        asking_price: extracted.asking_price?.toString() || '',
        additional_details: description
      }));

      setStep(2);
    } catch (error) {
      console.error('Analysis error:', error);
      alert('Could not analyze. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  // Photo handling
  function addPhotos(files) {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (photos.length + imageFiles.length > 10) {
      alert('Maximum 10 photos allowed');
      return;
    }
    const newPhotos = imageFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setPhotos([...photos, ...newPhotos]);
  }

  function handlePhotoSelect(e) {
    addPhotos(e.target.files);
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

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
    });
  }

  // Check if form is complete
  function isFormComplete() {
    return formData.designer && formData.item_type && formData.size &&
           formData.condition && formData.asking_price;
  }

  // Submit listing
  async function handleSubmit() {
    if (!isFormComplete()) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const draftResponse = await fetch('/api/create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: seller?.email,
          description: formData.additional_details,
          extracted: {
            designer: formData.designer,
            item_type: formData.item_type,
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
        alert(draftData.error || 'Failed to create draft.');
        return;
      }

      const productId = draftData.productId;

      // Upload photos
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const base64 = await fileToBase64(photo.file);

        await fetch('/api/product-image?action=add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            base64,
            filename: photo.file.name
          })
        });
      }

      setSubmitted(true);
    } catch (error) {
      console.error('Submit error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Loading state
  if (!seller) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Success screen
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Submitted!</h1>
          <p className="text-gray-600 mb-6">
            Your listing has been submitted for review. We'll notify you once it's live!
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/seller')}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
            >
              View Dashboard
            </button>
            <button
              onClick={() => {
                setSubmitted(false);
                setStep(1);
                setDescription('');
                setPhotos([]);
                setFormData({
                  designer: '', item_type: '', size: '', color: '',
                  material: '', condition: '', original_price: '', asking_price: '', additional_details: ''
                });
              }}
              className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-green-700 transition"
            >
              Submit Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => step === 1 ? navigate('/seller') : setStep(step - 1)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-medium text-gray-900">Submit a Listing</h1>
            <p className="text-sm text-gray-500">
              {step === 1 && 'Describe your item'}
              {step === 2 && 'Review details'}
              {step === 3 && 'Add photos'}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-3 h-3 rounded-full transition-colors ${
                s <= step ? 'bg-green-600' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* Step 1: Describe */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-medium text-gray-900">Describe Your Item</h2>
                <p className="text-gray-500 text-sm mt-1">Tell us about your piece - we'll extract the details</p>
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
                  Voice
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                    inputMode === 'text'
                      ? 'bg-green-100 text-green-700 border-2 border-green-500'
                      : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                  }`}
                >
                  Type
                </button>
              </div>

              {inputMode === 'voice' ? (
                <div className="text-center py-6">
                  {(isTranscribing || isAnalyzing) ? (
                    <div className="space-y-4">
                      <Loader2 className="w-16 h-16 mx-auto text-green-600 animate-spin" />
                      <p className="text-gray-600">
                        {isTranscribing ? 'Transcribing...' : 'Analyzing your description...'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`w-24 h-24 rounded-full flex items-center justify-center transition mx-auto ${
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
                      <p className="mt-4 text-gray-600">
                        {isRecording ? 'Tap to stop' : 'Tap to record'}
                      </p>
                      <p className="text-sm text-gray-400 mt-2">
                        Include: designer, type, size, color, condition, price
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Example: I have a Sana Safinaz lawn 3-piece suit, size medium, white with pink embroidery. It's in like new condition, wore it once. Original price was $200, asking $85."
                  rows={5}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-none"
                />
              )}

              {description && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Your description:</p>
                  <p className="text-gray-800 text-sm">{description}</p>
                </div>
              )}

              <button
                onClick={analyzeDescription}
                disabled={isAnalyzing || !description.trim()}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Continue'
                )}
              </button>
            </div>
          )}

          {/* Step 2: Form */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-medium text-gray-900">Review & Complete Details</h2>
                <p className="text-gray-500 text-sm mt-1">Edit any fields and fill in what's missing</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Designer/Brand <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.designer}
                      onChange={(e) => setFormData({ ...formData, designer: e.target.value })}
                      placeholder="e.g. Sana Safinaz"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none ${
                        formData.designer ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Item Type <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.item_type}
                      onChange={(e) => setFormData({ ...formData, item_type: e.target.value })}
                      placeholder="e.g. 3-piece lawn suit"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none ${
                        formData.item_type ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Size <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.size}
                      onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none ${
                        formData.size ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Select size...</option>
                      <option value="XS">XS</option>
                      <option value="S">S (Small)</option>
                      <option value="M">M (Medium)</option>
                      <option value="L">L (Large)</option>
                      <option value="XL">XL</option>
                      <option value="XXL">XXL</option>
                      <option value="One Size">One Size</option>
                      <option value="Custom">Custom/Unstitched</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Condition <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.condition}
                      onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none ${
                        formData.condition ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Select condition...</option>
                      <option value="New with tags">New with tags</option>
                      <option value="Like new">Like new</option>
                      <option value="Excellent">Excellent</option>
                      <option value="Good">Good</option>
                      <option value="Fair">Fair</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                    <input
                      type="text"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      placeholder="e.g. White with pink"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none ${
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
                      placeholder="e.g. Lawn, Chiffon, Silk"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none ${
                        formData.material ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Original Price ($)</label>
                    <input
                      type="number"
                      value={formData.original_price}
                      onChange={(e) => setFormData({ ...formData, original_price: e.target.value })}
                      placeholder="e.g. 200"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none ${
                        formData.original_price ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Asking Price ($) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.asking_price}
                      onChange={(e) => setFormData({ ...formData, asking_price: e.target.value })}
                      placeholder="e.g. 85"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none ${
                        formData.asking_price ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Details</label>
                  <textarea
                    value={formData.additional_details}
                    onChange={(e) => setFormData({ ...formData, additional_details: e.target.value })}
                    placeholder="Any other details about the item..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-none"
                  />
                </div>
              </div>

              {!isFormComplete() && (
                <p className="text-sm text-amber-600 text-center">
                  Please fill in all required fields (*)
                </p>
              )}

              <button
                onClick={() => setStep(3)}
                disabled={!isFormComplete()}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Photos
              </button>
            </div>
          )}

          {/* Step 3: Photos */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-medium text-gray-900">Add Photos</h2>
                <p className="text-gray-500 text-sm mt-1">Upload up to 10 photos of your item</p>
              </div>

              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-green-500 transition"
              >
                {photos.length === 0 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="py-12 text-center cursor-pointer"
                  >
                    <Camera className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-600 font-medium">Drop photos here</p>
                    <p className="text-gray-400 text-sm mt-1">or tap to browse</p>
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
                        <button
                          onClick={() => removePhoto(idx)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {photos.length < 10 && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-green-500 hover:text-green-500 transition bg-white"
                      >
                        <Camera className="w-8 h-8 mb-1" />
                        <span className="text-xs">Add</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />

              <p className="text-center text-sm text-gray-500">
                {photos.length}/10 photos
              </p>

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Submit Listing
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
