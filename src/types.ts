/**
 * Bitrix24 Plugin Types
 * Type definitions for attachments, typing indicators, and more
 */

/**
 * Attachment types supported by Bitrix24
 */
export type AttachmentType = "image" | "document" | "voice" | "video" | "file";

/**
 * Attachment metadata for incoming messages
 */
export interface Bitrix24Attachment {
  /** Unique file ID in Bitrix24 Disk */
  id: number;
  
  /** Internal storage file ID (from FILE_ID field) */
  fileId?: number;
  
  /** File name with extension */
  name: string;
  
  /** MIME type */
  type: string;
  
  /** File size in bytes */
  size: number;
  
  /** Attachment category */
  category: AttachmentType;
  
  /** Download URL (may require auth) */
  url?: string;
  
  /** Preview URL for images/videos */
  previewUrl?: string;
  
  /** For voice messages: duration in seconds */
  duration?: number;
  
  /** For transcribed voice: text content */
  transcription?: string;
  
  /** Content description from analysis (image description, extracted text, etc.) */
  contentDescription?: string;
}

/**
 * Options for sending file attachments
 */
export interface SendFileOptions {
  /** Target user or dialog ID */
  userId: string;
  
  /** File name with extension */
  fileName: string;
  
  /** MIME type */
  fileType: string;
  
  /** File content as buffer, base64 string, or URL */
  fileContent: Buffer | string;
  
  /** If true, fileContent is a URL (no upload needed) */
  isUrl?: boolean;
  
  /** Optional caption/text to send with file */
  caption?: string;
}

/**
 * Multiple attachment send options
 */
export interface SendAttachmentsOptions {
  /** Target user or dialog ID */
  userId: string;
  
  /** Multiple attachments to send */
  attachments: Array<{
    fileName: string;
    fileType: string;
    fileContent: Buffer | string;
    isUrl?: boolean;
    caption?: string;
  }>;
  
  /** Optional main message text */
  text?: string;
}

/**
 * Typing indicator options
 */
export interface TypingIndicatorOptions {
  /** Target user or dialog ID */
  userId: string;
  
  /** Duration in seconds (default: 60) */
  duration?: number;
}

/**
 * Command visibility options
 */
export interface CommandVisibilityOptions {
  /** Make command visible in / menu (default: true) */
  visible?: boolean;
  
  /** Command icon (emoji or icon class) */
  icon?: string;
  
  /** Command category/group */
  category?: string;
}

/**
 * Bitrix24 file info from disk.file.get API
 */
export interface Bitrix24FileInfo {
  ID: number;
  NAME: string;
  SIZE: number;
  TYPE: string;
  CREATE_TIME: string;
  UPDATE_TIME: string;
  DOWNLOAD_URL: string;
  DETAIL_URL: string;
}

/**
 * Bitrix24 ATTACH parameter structure
 */
export interface Bitrix24AttachPayload {
  MYFILES?: number | number[];
  ID?: number | number[];
  url?: string | string[];
}
