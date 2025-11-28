import { useState } from "react";
import { Lightbulb, Settings, RefreshCw, BookOpen, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

interface WelcomeScreenProps {
  userName?: string;
  onReadBookClick?: () => void;
  onPersonalTherapyClick?: () => void;
  onSettingsClick?: () => void;
  onRefreshClick?: () => void;
  onThemeToggle?: () => void;
}

const WelcomeScreen = ({
  userName = "Rehan",
  onReadBookClick,
  onPersonalTherapyClick,
  onSettingsClick,
  onRefreshClick,
  onThemeToggle,
}: WelcomeScreenProps) => {
  const [pressedButton, setPressedButton] = useState<string | null>(null);

  const handleButtonPress = (buttonId: string, callback?: () => void) => {
    setPressedButton(buttonId);
    setTimeout(() => {
      setPressedButton(null);
      callback?.();
    }, 150);
  };

  return (
    <div className="welcome-screen min-h-screen w-full bg-[#1A1A1A] flex flex-col">
      {/* Top Header Bar */}
      <header className="header w-full h-[60px] md:h-[70px] lg:h-[80px] px-4 md:px-5 lg:px-6 flex items-center justify-between bg-[#1A1A1A]">
        {/* Left Icon - Theme Toggle */}
        <button
          onClick={onThemeToggle}
          className="icon-button w-10 h-10 rounded-full bg-[#666666] flex items-center justify-center 
                     transition-all duration-200 hover:bg-[#777777] focus:outline-none focus:ring-2 focus:ring-white/30
                     active:scale-95"
          aria-label="Toggle theme"
        >
          <Lightbulb className="w-5 h-5 text-white" />
        </button>

        {/* Right Icons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onSettingsClick}
            className="icon-button w-10 h-10 rounded-full flex items-center justify-center
                       transition-all duration-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30
                       active:scale-95"
            aria-label="Settings"
          >
            <Settings className="w-6 h-6 text-white/90" />
          </button>
          <button
            onClick={onRefreshClick}
            className="icon-button w-10 h-10 rounded-full flex items-center justify-center
                       transition-all duration-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30
                       active:scale-95"
            aria-label="Refresh"
          >
            <RefreshCw className="w-6 h-6 text-white/90" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="content-area flex-1 flex flex-col px-5 md:px-6 lg:px-8 py-10 md:py-12 lg:py-16">
        {/* Greeting Text */}
        <h2 className="greeting-text text-white text-[24px] md:text-[28px] lg:text-[32px] font-light mb-2 md:mb-3">
          Hello {userName}
        </h2>

        {/* Main Question */}
        <h1 className="main-text text-white text-[28px] md:text-[36px] lg:text-[40px] font-normal md:font-medium leading-tight mb-4 md:mb-5">
          How can i help you today
        </h1>

        {/* Description Text */}
        <p className="description-text text-[#999999] text-[13px] md:text-[15px] lg:text-[16px] font-normal leading-relaxed max-w-md">
          is simply dummy text of the printing and typesetting industry. Lorem Ipsum
        </p>
      </div>

      {/* Bottom Buttons Container */}
      <div className="buttons-container px-5 md:px-6 lg:px-8 pb-6 md:pb-8 lg:pb-10">
        <div className="flex gap-3 md:gap-4 w-full max-w-lg mx-auto lg:max-w-xl">
          {/* Button 1 - Read me a book */}
          <button
            onClick={() => handleButtonPress("read-book", onReadBookClick)}
            className={cn(
              "action-button btn-read-book flex-1 flex items-center gap-3 md:gap-4",
              "bg-[#333333] hover:bg-[#4A4A4A] rounded-xl md:rounded-2xl",
              "px-4 md:px-5 py-4 md:py-5",
              "transition-all duration-200 cursor-pointer",
              "focus:outline-none focus:ring-2 focus:ring-white/30",
              pressedButton === "read-book" && "scale-[0.98]"
            )}
            data-action="read-book"
            aria-label="Read me a book"
          >
            <BookOpen className="w-6 h-6 md:w-7 md:h-7 text-white/90 flex-shrink-0" />
            <span className="text-white text-sm md:text-base font-normal">Read me a book</span>
          </button>

          {/* Button 2 - Personal therapy */}
          <button
            onClick={() => handleButtonPress("personal-therapy", onPersonalTherapyClick)}
            className={cn(
              "action-button btn-personal-therapy flex-1 flex items-center gap-3 md:gap-4",
              "bg-[#333333] hover:bg-[#4A4A4A] rounded-xl md:rounded-2xl",
              "px-4 md:px-5 py-4 md:py-5",
              "transition-all duration-200 cursor-pointer",
              "focus:outline-none focus:ring-2 focus:ring-white/30",
              pressedButton === "personal-therapy" && "scale-[0.98]"
            )}
            data-action="personal-therapy"
            aria-label="Personal therapy"
          >
            <ShoppingBag className="w-6 h-6 md:w-7 md:h-7 text-white/90 flex-shrink-0" />
            <span className="text-white text-sm md:text-base font-normal">Personal therapy</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
