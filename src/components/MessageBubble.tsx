import { Edit2, Trash2, Archive, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MessageBubbleProps {
  content: string;
  isUser: boolean;
}

const MessageBubble = ({ content, isUser }: MessageBubbleProps) => {
  if (isUser) {
    return (
      <div className="flex justify-end items-start gap-2 group px-4 md:px-8 py-4">
        <div className="flex flex-col items-end max-w-[85%] md:max-w-[70%]">
          <div className="bg-user-bubble/90 backdrop-blur-sm text-user-bubble-foreground px-5 py-3.5 rounded-3xl rounded-tr-md shadow-lg">
            <p className="text-sm md:text-base font-light">{content}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Edit2 className="h-4 w-4 mr-2" />
              Modifier
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Archive className="h-4 w-4 mr-2" />
              Archiver
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return null;
};

export default MessageBubble;
