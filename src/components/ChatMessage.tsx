interface ChatMessageProps {
  message: string;
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <p className="text-2xl md:text-3xl text-center text-foreground font-normal leading-relaxed max-w-2xl">
        {message}
      </p>
    </div>
  );
};

export default ChatMessage;
