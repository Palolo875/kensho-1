import ChatHeader from "@/components/ChatHeader";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import BottomNav from "@/components/BottomNav";

const Index = () => {
  return (
    <div className="min-h-screen relative">
      <ChatHeader />
      
      <main className="pt-16">
        <ChatMessage message="palo, c'est un plaisir de vous voir" />
      </main>

      <ChatInput />
      <BottomNav />
    </div>
  );
};

export default Index;
