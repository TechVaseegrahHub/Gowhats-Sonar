import React, { useState } from 'react';
import { IoClose } from 'react-icons/io5';
import { BiChevronLeft } from 'react-icons/bi';
import { HiTemplate, HiCheckCircle, HiInformationCircle } from 'react-icons/hi';
import { AiOutlineFileText } from 'react-icons/ai';
import TemplateForm from '../pages/TemplateForm';

const CreateTemplate = ({ onCancel, templateType }) => {
  const [category, setCategory] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showAlert, setShowAlert] = useState(true);

  const categories = [
    { 
      id: 'marketing', 
      name: 'Marketing', 
      icon: '📢', 
      color: 'from-blue-500 to-blue-600',
      description: 'Promotional messages and campaigns'
    },
    { 
      id: 'utility', 
      name: 'Utility', 
      icon: '🛠️', 
      color: 'from-green-500 to-green-600',
      description: 'Account updates and notifications'
    }
  ];

  const handleNameChange = (e) => {
    const value = e.target.value.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, '');
    setTemplateName(value);
  };

  const handleContinue = () => {
    if (category && templateName.length >= 3) {
      setShowTemplateForm(true);
    }
  };

  if (showTemplateForm) {
    return (
      <TemplateForm
        templateName={templateName}
        category={category}
        onCancel={() => setShowTemplateForm(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-green-50/20 to-gray-50">
      {/* Enhanced Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 z-10 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onCancel}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-xl transition-all"
              >
                <BiChevronLeft className="w-6 h-6" />
              </button>
              <div className="bg-gradient-to-br from-green-500 to-green-600 p-3 rounded-xl shadow-lg">
                <HiTemplate className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                  New Message Template
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">Configure your template details</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onCancel}
                className="hidden lg:flex items-center gap-2 px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-all border border-gray-300 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleContinue}
                disabled={!category || templateName.length < 3}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg ${
                  category && templateName.length >= 3
                    ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-green-600/30 hover:shadow-xl hover:scale-105 active:scale-95'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <span>Continue</span>
                {category && templateName.length >= 3 && (
                  <HiCheckCircle className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        
        {/* Info Banner */}
        <div className="bg-gradient-to-r from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-4 mb-8 shadow-sm">
          <div className="flex items-start gap-3">
            <HiInformationCircle className="text-blue-600 flex-shrink-0 w-5 h-5 mt-0.5" />
            <div>
              <p className="text-sm text-gray-700 font-medium">
                Templates require WhatsApp approval before use. This typically takes 24-48 hours.
              </p>
              <a href="#" className="text-blue-600 hover:underline text-sm font-semibold mt-1 inline-block">
                Learn about template guidelines →
              </a>
            </div>
          </div>
        </div>

        {/* Category Selection */}
        <div className="mb-8">
          <div className="mb-5">
            <label className="flex items-center gap-2 text-gray-900 font-bold text-lg mb-2">
              <span className="bg-green-100 text-green-700 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold">1</span>
              Select Category
              <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-600">
              Choose the type of message you'll be sending to your customers
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`
                  relative p-6 border-2 rounded-xl transition-all group overflow-hidden
                  ${category === cat.id 
                    ? 'border-green-500 bg-green-50 shadow-lg shadow-green-500/20' 
                    : 'border-gray-200 hover:border-green-300 hover:shadow-md bg-white'
                  }
                `}
              >
                {/* Selected Indicator */}
                {category === cat.id && (
                  <div className="absolute top-3 right-3">
                    <HiCheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                )}
                
                <div className="flex flex-col items-center text-center gap-3">
                  <div className={`bg-gradient-to-br ${cat.color} p-4 rounded-xl shadow-lg text-white text-3xl`}>
                    {cat.icon}
                  </div>
                  <div>
                    <span className={`text-lg font-bold ${
                      category === cat.id ? 'text-green-700' : 'text-gray-900 group-hover:text-green-600'
                    }`}>
                      {cat.name}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">{cat.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Template Name */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="mb-5">
            <label className="flex items-center gap-2 text-gray-900 font-bold text-lg mb-2">
              <span className="bg-green-100 text-green-700 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold">2</span>
              Template Name
              <span className="text-red-500">*</span>
            </label>
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-gray-600">
                Use lowercase letters, numbers, and underscores only (min. 3 characters)
              </p>
              <span className={`text-xs font-bold ${
                templateName.length >= 3 ? 'text-green-600' : 'text-gray-400'
              }`}>
                {templateName.length} / 250
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <AiOutlineFileText className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={templateName}
              onChange={handleNameChange}
              placeholder="e.g., welcome_message_2024"
              className={`w-full pl-12 pr-4 py-3.5 border-2 rounded-xl text-sm font-medium transition-all outline-none ${
                templateName.length >= 3
                  ? 'border-green-500 focus:ring-2 focus:ring-green-500/20 bg-green-50/30'
                  : 'border-gray-300 focus:border-green-500 focus:ring-2 focus:ring-green-500/20'
              }`}
              maxLength={250}
            />
            {templateName.length >= 3 && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <HiCheckCircle className="w-5 h-5 text-green-600" />
              </div>
            )}
          </div>

          {/* Validation Messages */}
          {templateName.length > 0 && templateName.length < 3 && (
            <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
              <span>⚠️</span>
              Name must be at least 3 characters long
            </p>
          )}
          {templateName.length >= 3 && (
            <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
              <HiCheckCircle className="w-4 h-4" />
              Template name is valid
            </p>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-6 bg-gray-50 rounded-xl p-5 border border-gray-200">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <HiInformationCircle className="w-5 h-5 text-gray-600" />
            Template Naming Guidelines
          </h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">✓</span>
              <span>Use descriptive names like <code className="bg-white px-2 py-0.5 rounded font-mono text-xs">order_confirmation</code></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">✓</span>
              <span>Only lowercase letters (a-z), numbers (0-9), and underscores (_)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-0.5">✗</span>
              <span>Avoid spaces, special characters, or uppercase letters</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CreateTemplate;
