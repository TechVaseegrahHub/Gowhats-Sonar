import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { publicApi } from '../utils/axios.js';
import toast from 'react-hot-toast';
import { Tag, Plus, Edit, Trash2, Palette, Loader2, X } from 'lucide-react';

// ===================================================================================
// STYLED COMPONENTS - Professional Green Theme for Tag Management
// ===================================================================================

const Container = styled.div`
  max-width: 1000px;
  margin: 0 auto;
`;

const FormCard = styled.div`
  background-color: #F0FFF4; /* Light Mint Green */
  border: 1px solid #D1FAE5;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 32px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
`;

const FormTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Form = styled.form`
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
`;

const InputGroup = styled.div`
  flex: 1;
  min-width: 200px;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 500;
  color: #555;
  margin-bottom: 6px;
  display: block;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 14px;
  &:focus {
    outline: none;
    border-color: #4CAF50;
    box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.2);
  }
`;

const ColorPickerWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;

  input[type="color"] {
    -webkit-appearance: none;
    width: 38px;
    height: 38px;
    border: none;
    padding: 0;
    background: none;
    cursor: pointer;
    &::-webkit-color-swatch-wrapper {
      padding: 0;
    }
    &::-webkit-color-swatch {
      border: 1px solid #ccc;
      border-radius: 8px;
    }
  }
`;

const Button = styled.button`
  padding: 10px 20px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s ease;
  white-space: nowrap;

  &:hover {
    background-color: #45a049;
  }
  &:disabled {
    background-color: #a5d6a7;
    cursor: not-allowed;
  }
`;

const TagListHeader = styled.h2`
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e0e0e0;
`;

const TagList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
`;

const TagItem = styled.div`
  background-color: white;
  border: 1px solid #e0e0e0;
  border-left-width: 4px;
  border-left-color: ${props => props.color || '#ccc'};
  border-radius: 8px;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 4px rgba(0,0,0,0.03);
`;

const TagName = styled.span`
  font-weight: 500;
`;

const ActionButton = styled.button`
  padding: 6px;
  border-radius: 50%;
  background: none;
  border: none;
  cursor: pointer;
  color: #888;
  transition: all 0.2s ease;
  
  &:hover {
    color: #333;
    background-color: #f0f0f0;
  }
`;

// ===================================================================================
// TAGS MANAGEMENT COMPONENT
// ===================================================================================

const TagsComponent = () => {
  const [tags, setTags] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#4CAF50');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch all tags on component mount
  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await publicApi.get("/api/tags", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) {
        setTags(response.data.data || []);
      }
    } catch (error) {
      toast.error("Failed to load tags.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Handle Create New Tag
  const handleCreateTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) {
      toast.error("Tag name cannot be empty.");
      return;
    }
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const response = await publicApi.post("/api/tags", 
        { name: newTagName, color: newTagColor },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        toast.success("Tag created successfully!");
        setTags(prev => [...prev, response.data.data]);
        setNewTagName(''); // Reset form
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create tag.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Tag
  const handleDeleteTag = async (tagId) => {
    if (!window.confirm("Are you sure you want to delete this tag? This cannot be undone.")) return;

    try {
      const token = localStorage.getItem("token");
      await publicApi.delete(`/api/tags/${tagId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Tag deleted successfully!");
      setTags(prev => prev.filter(tag => tag._id !== tagId));
    } catch (error) {
      toast.error("Failed to delete tag.");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-green-600" />
      </div>
    );
  }

  return (
    <Container>
      <FormCard>
        <FormTitle><Plus size={20}/> Create New Tag</FormTitle>
        <Form onSubmit={handleCreateTag}>
          <InputGroup>
            <Label htmlFor="tagName">Tag Name</Label>
            <Input
              id="tagName"
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="e.g., Follow Up, VIP Customer"
              required
            />
          </InputGroup>
          <InputGroup style={{ flex: '0 1 150px' }}>
            <Label htmlFor="tagColor">Tag Color</Label>
            <ColorPickerWrapper>
              <Palette size={18} style={{ color: newTagColor }}/>
              <Input
                id="tagColor"
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
              />
              <span style={{ fontFamily: 'monospace' }}>{newTagColor}</span>
            </ColorPickerWrapper>
          </InputGroup>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
            {isSubmitting ? 'Creating...' : 'Create Tag'}
          </Button>
        </Form>
      </FormCard>

      <div>
        <TagListHeader>Existing Tags ({tags.length})</TagListHeader>
        {tags.length > 0 ? (
          <TagList>
            {tags.map(tag => (
              <TagItem key={tag._id} color={tag.color}>
                <TagName>{tag.name}</TagName>
                <div className="flex items-center gap-2">
                  {/* Edit functionality can be added here later */}
                  {/* <ActionButton onClick={() => alert('Edit functionality coming soon!')}>
                    <Edit size={16} />
                  </ActionButton> */}
                  <ActionButton onClick={() => handleDeleteTag(tag._id)} style={{ color: '#EF4444' }}>
                    <Trash2 size={16} />
                  </ActionButton>
                </div>
              </TagItem>
            ))}
          </TagList>
        ) : (
          <p className="text-gray-500 mt-4 text-center">No tags created yet. Use the form above to add your first tag.</p>
        )}
      </div>
    </Container>
  );
};

export default TagsComponent;
