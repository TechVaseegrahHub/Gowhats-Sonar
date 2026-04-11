// components/AIAssistantToggle.jsx
import React from 'react';
import { Bot } from 'lucide-react';
import botImg from "../images/3d roboat3.png";

const AIAssistantToggle = ({ onClick, isActive, hasNewFeatures = true }) => {
  return (
    <button
      onClick={onClick}
	className={`fixed right-4 bottom-24 md:bottom-4 flex items-center justify-center transition-all duration-300 hover:scale-110 z-40 ${

        isActive 
          ? ' text-white' 
          : 'text-gray-600  '
      }`}
      title="VBot"
    >
      {/* Replace Bot with custom image */}
      <img 
        src={botImg}
        alt="AI Assistant"
        className={`w-20 h-20 ${isActive ? 'animate' : ''}`} 
      />
      
      {/* Real-time data indicator */}
      {hasNewFeatures && (
        <div className="absolute top-1 -right-1 w-3 h-3 bg-green-700 rounded-full animate-pulse"></div>
      )}
      {/* Data streaming indicator */}
      <div className="absolute bottom-1 -right-1 w-2 h-2 bg-blue-700 rounded-full animate-bounce"></div>
    </button>
  );
};

export default AIAssistantToggle;
