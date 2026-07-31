export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      posts: {
        Row: {
          id: string; image_url: string; author_name: string; author_id: string | null;
          author_avatar: string | null; caption: string; hashtags: string[]; location: string | null;
          is_public: boolean; comments_allowed: boolean; custom_pose_allowed: boolean;
          likes_count: number; comments_count: number; pose_template: Json | null;
          client_request_id: string | null; created_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["posts"]["Row"], "id" | "created_at">> & { image_url: string; author_name: string };
        Update: Partial<Database["public"]["Tables"]["posts"]["Row"]>;
        Relationships: [];
      };
      post_images: {
        Row: { id: string; post_id: string; image_url: string; sort_order: number; created_at: string };
        Insert: { id?: string; post_id: string; image_url: string; sort_order?: number; created_at?: string };
        Update: Partial<{ image_url: string; sort_order: number }>;
        Relationships: [];
      };
      comments: {
        Row: { id: string; post_id: string; user_id: string; content: string; author_name: string; created_at: string };
        Insert: { id?: string; post_id: string; user_id?: string; content: string; author_name: string; created_at?: string };
        Update: Partial<{ content: string }>;
        Relationships: [];
      };
      post_likes: {
        Row: { post_id: string; user_id: string; created_at: string };
        Insert: { post_id: string; user_id?: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: { user_id: string; nickname: string; avatar_url: string | null; bio: string | null; created_at: string };
        Insert: { user_id: string; nickname: string; avatar_url?: string | null; bio?: string | null; created_at?: string };
        Update: Partial<{ nickname: string; avatar_url: string | null; bio: string | null }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
