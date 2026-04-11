import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { publicApi } from '../utils/axios.js';
import FileUpload from './FileUpload.jsx';
import {
  Brain,
  Save,
  RefreshCw,
  Store,
  MessageCircle,
  Settings,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Upload
} from 'lucide-react';

const BotSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('knowledge'); // 'knowledge' or 'config'

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch
  } = useForm({
    defaultValues: {
      businessName: 'My Business',
      businessType: 'ecommerce',
      businessIndustry: '',
      botConfig: {
        botName: 'Assistant',
        botPersonality: 'professional',
        language: 'en',
        greetingMessage: "I'm here to help you. What would you like to know?",
        fallbackMessage: 'I can help you with information from our catalog. Could you please rephrase your question?',
        thanksMessage: "You're welcome! Anything else I can help you with?",
        goodbyeMessage: 'Feel free to reach out anytime!',
        noResponseMessage: 'Alright! Feel free to ask if you need any information.'
      },
      terminology: {
        itemName: 'products',
        catalogName: 'catalog',
        pricingTerm: 'price'
      },
      responseConfig: {
        maxWordCount: 150,
        includeEmoji: true,
        emojiStyle: '🤖',
        alwaysAskFollowUp: false,
        mentionBusinessName: true,
        formalTone: false
      },
      contactInfo: {
        supportPhone: '',
        supportEmail: '',
        website: '',
        workingHours: ''
      },
      customInstructions: ''
    }
  });

  const businessType = watch('businessType');
  const includeEmoji = watch('responseConfig.includeEmoji');

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await publicApi.get('/api/tenant/config', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setConfig(response.data.config);
        reset(response.data.config);
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
      toast.error('Failed to load bot configuration');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data) => {
    try {
      setSaving(true);
      const token = localStorage.getItem('token');

      const response = await publicApi.put('/api/tenant/config', data, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        toast.success('Bot configuration saved successfully!');
        setConfig(response.data.config);
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = async (templateType) => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await publicApi.post('/api/tenant/apply-template', {
        businessType: templateType,
        businessName: watch('businessName') || 'My Business'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        toast.success(`${templateType} template applied!`);
        reset(response.data.config);
        setConfig(response.data.config);
      }
    } catch (error) {
      console.error('Error applying template:', error);
      toast.error('Failed to apply template');
    }
  };

  if (loading) {
    return (
      <div className="p-4 -mt-16 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <div className="flex items-center justify-center min-h-[70vh]">
              <div className="text-center">
                <Loader2 className="h-16 w-16 animate-spin text-emerald-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Loading AI Configuration</h3>
                <p className="text-gray-600">Please wait...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 -mt-16 lg:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Tab Navigation */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('knowledge')}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                activeTab === 'knowledge'
                  ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Brain className="w-5 h-5 inline mr-2" />
              Knowledge Base
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                activeTab === 'config'
                  ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Settings className="w-5 h-5 inline mr-2" />
              Bot Configuration
            </button>
          </div>
        </div>

        {/* Knowledge Base Tab */}
        {activeTab === 'knowledge' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 px-8 py-12 border-b border-gray-100">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Brain className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Knowledge Base</h1>
                  <p className="text-lg text-gray-600 mt-2">Upload your business information for AI training</p>
                </div>
              </div>
            </div>
            <div className="p-8">
              <FileUpload />
            </div>
          </div>
        )}

        {/* Bot Configuration Tab */}
        {activeTab === 'config' && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            
            {/* Business Information */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-8 py-8 border-b border-gray-100">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                    <Store className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Business Information</h2>
                    <p className="text-gray-600 mt-1">Configure your business details</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      Business Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      {...register('businessName', { required: 'Business name is required' })}
                      type="text"
                      className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                        errors.businessName ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Enter your business name"
                    />
                    {errors.businessName && (
                      <p className="text-red-600 text-sm mt-1">{errors.businessName.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      Business Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      {...register('businessType', { required: 'Business type is required' })}
                      className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                        errors.businessType ? 'border-red-300' : 'border-gray-300'
                      }`}
                    >
                      <option value="ecommerce">E-commerce / Retail</option>
                      <option value="service">Service Business</option>
                      <option value="restaurant">Restaurant / Cafe</option>
                      <option value="real_estate">Real Estate</option>
                      <option value="education">Education / Training</option>
                      <option value="healthcare">Healthcare / Medical</option>
                      <option value="automotive">Automotive</option>
                      <option value="travel">Travel & Tourism</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      Industry
                    </label>
                    <input
                      {...register('businessIndustry')}
                      type="text"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="e.g., Herbal Products, Fashion, Electronics"
                    />
                  </div>
                </div>

                {/* Quick Templates */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Quick Setup Templates:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applyTemplate('ecommerce')}
                      className="px-4 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm font-medium hover:border-blue-500 hover:bg-blue-50 transition-colors"
                    >
                      🛍️ E-commerce
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTemplate('service')}
                      className="px-4 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm font-medium hover:border-purple-500 hover:bg-purple-50 transition-colors"
                    >
                      💼 Service Business
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTemplate('restaurant')}
                      className="px-4 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm font-medium hover:border-orange-500 hover:bg-orange-50 transition-colors"
                    >
                      🍕 Restaurant
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bot Personality */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-purple-50 via-pink-50 to-rose-50 px-8 py-8 border-b border-gray-100">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Bot Personality</h2>
                    <p className="text-gray-600 mt-1">Customize how your AI assistant communicates</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Bot Name</label>
                    <input
                      {...register('botConfig.botName')}
                      type="text"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                      placeholder="Assistant"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Personality</label>
                    <select
                      {...register('botConfig.botPersonality')}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    >
                      <option value="professional">Professional</option>
                      <option value="friendly">Friendly</option>
                      <option value="casual">Casual</option>
                      <option value="formal">Formal</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Response Configuration */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 px-8 py-8 border-b border-gray-100">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Response Settings</h2>
                    <p className="text-gray-600 mt-1">Configure response format and style</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-xl">
                  <input
                    {...register('responseConfig.includeEmoji')}
                    type="checkbox"
                    id="includeEmoji"
                    className="h-5 w-5 text-emerald-600 rounded"
                  />
                  <label htmlFor="includeEmoji" className="text-sm font-semibold text-gray-900">
                    Include emoji in responses
                  </label>
                </div>

                {includeEmoji && (
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Emoji Style</label>
                    <input
                      {...register('responseConfig.emojiStyle')}
                      type="text"
                      maxLength={2}
                      className="w-32 px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-2xl text-center"
                      placeholder="🤖"
                    />
                    <p className="text-xs text-gray-600 mt-2">Single emoji only</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Max Word Count
                  </label>
                  <input
                    {...register('responseConfig.maxWordCount', { min: 50, max: 300 })}
                    type="number"
                    min="50"
                    max="300"
                    className="w-32 px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="150"
                  />
                  <p className="text-xs text-gray-600 mt-2">Range: 50-300 words</p>
                </div>
              </div>
            </div>

            {/* Custom Messages */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 px-8 py-8 border-b border-gray-100">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-600 to-amber-600 rounded-xl flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Custom Messages</h2>
                    <p className="text-gray-600 mt-1">Personalize automated responses</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Greeting Message</label>
                  <textarea
                    {...register('botConfig.greetingMessage')}
                    rows={2}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    placeholder="I'm here to help you. What would you like to know?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Fallback Message</label>
                  <textarea
                    {...register('botConfig.fallbackMessage')}
                    rows={2}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    placeholder="I can help you with information from our catalog."
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Thank You Message</label>
                  <textarea
                    {...register('botConfig.thanksMessage')}
                    rows={2}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    placeholder="You're welcome! Anything else I can help you with?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Goodbye Message</label>
                  <textarea
                    {...register('botConfig.goodbyeMessage')}
                    rows={2}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    placeholder="Feel free to reach out anytime!"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">Negative Response Message</label>
                  <textarea
                    {...register('botConfig.noResponseMessage')}
                    rows={2}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    placeholder="Alright! Feel free to ask if you need any information."
                  />
                </div>
              </div>
            </div>

            {/* Business Terminology */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 px-8 py-8 border-b border-gray-100">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-xl flex items-center justify-center">
                    <Store className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Business Terminology</h2>
                    <p className="text-gray-600 mt-1">Define terms specific to your business</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      What do you sell?
                    </label>
                    <input
                      {...register('terminology.itemName')}
                      type="text"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="products, services, dishes"
                    />
                    <p className="text-xs text-gray-600 mt-1">Plural form</p>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      Catalog Name
                    </label>
                    <input
                      {...register('terminology.catalogName')}
                      type="text"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="catalog, menu, list"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      Pricing Term
                    </label>
                    <input
                      {...register('terminology.pricingTerm')}
                      type="text"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="price, fee, cost"
                    />
                  </div>
                </div>

                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-blue-900 mb-1">How this works:</p>
                      <p className="text-sm text-blue-800">
                        Your bot will use these terms in responses. For example, if you set "dishes" as items, 
                        the bot will say "I can help you with our dishes" instead of "products."
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Custom AI Instructions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-violet-50 via-purple-50 to-fuchsia-50 px-8 py-8 border-b border-gray-100">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-purple-600 rounded-xl flex items-center justify-center">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Custom AI Instructions</h2>
                    <p className="text-gray-600 mt-1">Add specific instructions for your AI assistant</p>
                  </div>
                </div>
              </div>

              <div className="p-8">
                <textarea
                  {...register('customInstructions')}
                  rows={6}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  placeholder="Example: 'Always mention delivery times', 'Focus on eco-friendly aspects', 'Suggest related products'..."
                />
                
                <div className="mt-4 grid md:grid-cols-2 gap-4">
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <p className="text-xs font-semibold text-green-900 mb-1">Good Examples:</p>
                    <ul className="text-xs text-green-800 space-y-1">
                      <li>• "Always mention product certifications"</li>
                      <li>• "Emphasize our 24-hour delivery"</li>
                      <li>• "Suggest complementary items"</li>
                    </ul>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <p className="text-xs font-semibold text-amber-900 mb-1">Tips:</p>
                    <ul className="text-xs text-amber-800 space-y-1">
                      <li>• Be specific and clear</li>
                      <li>• Focus on unique selling points</li>
                      <li>• Include tone preferences</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end space-y-4 sm:space-y-0 sm:space-x-4">
              <button
                type="button"
                onClick={loadConfiguration}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all flex items-center justify-center"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                Reset Changes
              </button>
              
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-700 hover:to-teal-700 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {saving ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5 mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    Save Configuration
                  </>
                )}
              </button>
            </div>

            {/* Info Notice */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
              <div className="flex items-start space-x-4">
                <CheckCircle2 className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-bold text-blue-900 mb-2">Configuration Tips</h3>
                  <ul className="text-sm text-blue-800 space-y-2">
                    <li>• Changes take effect immediately after saving</li>
                    <li>• Test your bot after making changes to ensure it responds as expected</li>
                    <li>• Use business templates for quick setup, then customize as needed</li>
                    <li>• Custom instructions help tailor responses to your specific needs</li>
                  </ul>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BotSettings;
