import { createContext, useContext, useState, ReactNode } from "react";

interface UserPreferences {
  firstName: string;
  lastName: string;
  welcomeMessage: string;
  setFirstName: (name: string) => void;
  setLastName: (name: string) => void;
  setWelcomeMessage: (message: string) => void;
}

const UserPreferencesContext = createContext<UserPreferences | undefined>(undefined);

export const UserPreferencesProvider = ({ children }: { children: ReactNode }) => {
  const [firstName, setFirstNameState] = useState(() => {
    return localStorage.getItem("userFirstName") || "";
  });
  const [lastName, setLastNameState] = useState(() => {
    return localStorage.getItem("userLastName") || "";
  });
  const [welcomeMessage, setWelcomeMessageState] = useState(() => {
    return localStorage.getItem("userWelcomeMessage") || "";
  });

  const setFirstName = (name: string) => {
    setFirstNameState(name);
    localStorage.setItem("userFirstName", name);
  };

  const setLastName = (name: string) => {
    setLastNameState(name);
    localStorage.setItem("userLastName", name);
  };

  const setWelcomeMessage = (message: string) => {
    setWelcomeMessageState(message);
    localStorage.setItem("userWelcomeMessage", message);
  };

  return (
    <UserPreferencesContext.Provider value={{ firstName, lastName, welcomeMessage, setFirstName, setLastName, setWelcomeMessage }}>
      {children}
    </UserPreferencesContext.Provider>
  );
};

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    throw new Error("useUserPreferences must be used within UserPreferencesProvider");
  }
  return context;
};
