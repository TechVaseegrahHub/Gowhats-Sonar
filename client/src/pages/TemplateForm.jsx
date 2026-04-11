import React, { useState } from 'react';
import { X, AlertCircle, CheckCircle, Image, FileText, Send } from 'lucide-react';

// Mock API call
const createTemplate = async (templateData) => {
  console.log('Creating template with data:', JSON.stringify(templateData, null, 2));

  // Simulate API call
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Validate the structure
      if (!templateData.name || templateData.name.length < 3) {
        reject({ error: 'Template name must be at least 3 characters' });
        return;
      }

      if (!templateData.category) {
        reject({ error: 'Category is required' });
        return;
      }

      if (!templateData.components || templateData.components.length === 0) {
        reject({ error: 'At least one component is required' });
        return;
      }

      // Check if BODY has variables and examples
      const bodyComponent = templateData.components.find(c => c.type === 'BODY');
      if (bodyComponent && bodyComponent.text) {
        const variableCount = (bodyComponent.text.match(/\{\{(\d+)\}\}/g) || []).length;
        if (variableCount > 0) {
          if (!bodyComponent.example || !bodyComponent.example.body_text) {
            reject({ error: 'Body component with variables requires example parameter' });
            return;
          }
          if (bodyComponent.example.body_text[0].length !== variableCount) {
            reject({ error: `Body has ${variableCount} variables but only ${bodyComponent.example.body_text[0].length} examples provided` });
            return;
          }
        }
      }

      // Check HEADER if it has variables
      const headerComponent = templateData.components.find(c => c.type === 'HEADER');
      if (headerComponent && headerComponent.format === 'TEXT' && headerComponent.text) {
        const variableCount = (headerComponent.text.match(/\{\{(\d+)\}\}/g) || []).length;
        if (variableCount > 0) {
          if (!headerComponent.example || !headerComponent.example.header_text) {
            reject({ error: 'Header component with variables requires example parameter' });
            return;
          }
        }
      }

      resolve({ success: true, id: 'template_' + Date.now() });
    }, 1000);
  });
};

export default function TemplateCreationDemo() {
  const [formData, setFormData] = useState({
    name: 'new_product_announcement',
    category: 'MARKETING',
    language: 'en',
    headerType: 'IMAGE',
    headerText: '',
    bodyText: 'Hi {{1}}, check out our new products! Use code {{2}} for {{3}}% off.',
    footerText: 'Powered by GoWhats',
    hasButtons: false,
    buttons: []
  });

  const [bodyExamples, setBodyExamples] = useState(['John', 'SAVE20', '20']);
  const [headerExamples, setHeaderExamples] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  // Count variables in text
  const countVariables = (text) => {
    if (!text) return 0;
    const matches = text.match(/\{\{(\d+)\}\}/g);
    return matches ? matches.length : 0;
  };

  // Validate the entire form
  const validateForm = () => {
    const errors = [];

    // Name validation
    if (!formData.name || formData.name.length < 3) {
      errors.push('Template name must be at least 3 characters');
    }
    if (!/^[a-z0-9_]+$/.test(formData.name)) {
      errors.push('Template name can only contain lowercase letters, numbers, and underscores');
    }

    // Body validation
    if (!formData.bodyText || formData.bodyText.trim().length === 0) {
      errors.push('Body text is required');
    }

    const bodyVarCount = countVariables(formData.bodyText);
    if (bodyVarCount > 0 && bodyExamples.length !== bodyVarCount) {
      errors.push(`Body has ${bodyVarCount} variables but ${bodyExamples.length} examples provided`);
    }
    if (bodyVarCount > 0 && bodyExamples.some(e => !e || e.trim().length === 0)) {
      errors.push('All body variable examples must be filled');
    }

    // Header validation
    if (formData.headerType === 'TEXT' && formData.headerText) {
      const headerVarCount = countVariables(formData.headerText);
      if (headerVarCount > 0 && headerExamples.length !== headerVarCount) {
        errors.push(`Header has ${headerVarCount} variables but ${headerExamples.length} examples provided`);
      }
      if (headerVarCount > 0 && headerExamples.some(e => !e || e.trim().length === 0)) {
        errors.push('All header variable examples must be filled');
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Build the proper API payload
  const buildPayload = () => {
    const components = [];

    // HEADER component
    if (formData.headerType === 'TEXT' && formData.headerText) {
      const headerComponent = {
        type: 'HEADER',
        format: 'TEXT',
        text: formData.headerText
      };

      const headerVarCount = countVariables(formData.headerText);
      if (headerVarCount > 0) {
        headerComponent.example = {
          header_text: [headerExamples.filter(e => e && e.trim().length > 0)]
        };
      }

      components.push(headerComponent);
    } else if (formData.headerType === 'IMAGE') {
      components.push({
        type: 'HEADER',
        format: 'IMAGE'
      });
    }

    // BODY component
    const bodyComponent = {
      type: 'BODY',
      text: formData.bodyText
    };

    const bodyVarCount = countVariables(formData.bodyText);
    if (bodyVarCount > 0) {
      // CRITICAL: The example format must be an array containing an array
      bodyComponent.example = {
        body_text: [bodyExamples.filter(e => e && e.trim().length > 0)]
      };
    }

    components.push(bodyComponent);

    // FOOTER component
    if (formData.footerText && formData.footerText.trim().length > 0) {
      components.push({
        type: 'FOOTER',
        text: formData.footerText
      });
    }

    // BUTTONS component
    if (formData.hasButtons && formData.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: formData.buttons
      });
    }

    return {
      name: formData.name,
      language: formData.language,
      category: formData.category,
      components: components
    };
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(false);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const payload = buildPayload();
      console.log('Submitting payload:', payload);

      const result = await createTemplate(payload);
      setSuccess(true);
      setError(null);
    } catch (err) {
      setError(err.error || 'Failed to create template');
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  // Update body examples when body text changes
  React.useEffect(() => {
    const count = countVariables(formData.bodyText);
    if (count !== bodyExamples.length) {
      setBodyExamples(Array(count).fill('').map((_, i) => bodyExamples[i] || ''));
    }
  }, [formData.bodyText]);

  // Update header examples when header text changes
  React.useEffect(() => {
    if (formData.headerType === 'TEXT') {
      const count = countVariables(formData.headerText);
      if (count !== headerExamples.length) {
        setHeaderExamples(Array(count).fill('').map((_, i) => headerExamples[i] || ''));
      }
    }
  }, [formData.headerText, formData.headerType]);

  const bodyVarCount = countVariables(formData.bodyText);
  const headerVarCount = formData.headerType === 'TEXT' ? countVariables(formData.headerText) : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-5 text-white">
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <FileText className="w-7 h-7" />
              WhatsApp Template Creator
            </h1>
            <p className="text-green-100 text-sm mt-1">
              Properly formatted template with variable examples
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Error Display */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-900 text-sm mb-2">
                      Validation Errors
                    </h3>
                    <ul className="space-y-1">
                      {validationErrors.map((err, i) => (
                        <li key={i} className="text-sm text-red-700">• {err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Success Display */}
            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-green-900 font-medium">
                    Template created successfully! It will be submitted for WhatsApp approval.
                  </p>
                </div>
              </div>
            )}

            {/* Error from API */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <p className="text-red-900 font-medium">{error}</p>
                </div>
              </div>
            )}

            {/* Template Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Template Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  const value = e.target.value.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, '');
                  setFormData({ ...formData, name: value });
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                placeholder="e.g., new_product_announcement"
              />
              <p className="text-xs text-gray-500 mt-1">
                Lowercase letters, numbers, and underscores only
              </p>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              >
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utility</option>
              </select>
            </div>

            {/* Header Type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Header Type
              </label>
              <select
                value={formData.headerType}
                onChange={(e) => setFormData({ ...formData, headerType: e.target.value, headerText: '' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              >
                <option value="NONE">None</option>
                <option value="TEXT">Text</option>
                <option value="IMAGE">Image</option>
              </select>
            </div>

            {/* Header Text (if TEXT) */}
            {formData.headerType === 'TEXT' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Header Text {headerVarCount > 0 && <span className="text-blue-600">({headerVarCount} variable{headerVarCount > 1 ? 's' : ''})</span>}
                </label>
                <input
                  type="text"
                  value={formData.headerText}
                  onChange={(e) => setFormData({ ...formData, headerText: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  placeholder="e.g., Welcome {{1}}!"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {'{{1}}'}, {'{{2}}'}, etc. for variables
                </p>

                {/* Header Examples */}
                {headerVarCount > 0 && (
                  <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-semibold text-blue-900 mb-3">
                      Provide example values for header variables:
                    </p>
                    <div className="space-y-2">
                      {headerExamples.map((example, i) => (
                        <div key={i}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Variable {'{{' + (i + 1) + '}}'}
                          </label>
                          <input
                            type="text"
                            value={example}
                            onChange={(e) => {
                              const newExamples = [...headerExamples];
                              newExamples[i] = e.target.value;
                              setHeaderExamples(newExamples);
                            }}
                            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            placeholder={`Example for {{${i + 1}}}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Body Text */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Body Text <span className="text-red-500">*</span> {bodyVarCount > 0 && <span className="text-blue-600">({bodyVarCount} variable{bodyVarCount > 1 ? 's' : ''})</span>}
              </label>
              <textarea
                value={formData.bodyText}
                onChange={(e) => setFormData({ ...formData, bodyText: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                rows={4}
                placeholder="e.g., Hi {{1}}, check out our new products!"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use {'{{1}}'}, {'{{2}}'}, etc. for variables
              </p>

              {/* Body Examples */}
              {bodyVarCount > 0 && (
                <div className="mt-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm font-semibold text-yellow-900 mb-3">
                    ⚠️ Required: Provide example values for body variables
                  </p>
                  <div className="space-y-2">
                    {bodyExamples.map((example, i) => (
                      <div key={i}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Variable {'{{' + (i + 1) + '}}'}
                        </label>
                        <input
                          type="text"
                          value={example}
                          onChange={(e) => {
                            const newExamples = [...bodyExamples];
                            newExamples[i] = e.target.value;
                            setBodyExamples(newExamples);
                          }}
                          className="w-full px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none"
                          placeholder={`Example for {{${i + 1}}}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Footer (Optional)
              </label>
              <input
                type="text"
                value={formData.footerText}
                onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                placeholder="e.g., Powered by GoWhats"
                maxLength={60}
              />
            </div>

            {/* Submit Button */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Submit for Approval
                  </>
                )}
              </button>
            </div>

            {/* Payload Preview */}
            <details className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <summary className="cursor-pointer font-semibold text-gray-700 text-sm">
                View API Payload (Developer)
              </summary>
              <pre className="mt-3 text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto">
                {JSON.stringify(buildPayload(), null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
