import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api/v1';

export interface PostCommentRequest {
  video_url: string;
  text: string;
}

export interface PostCommentResponse {
  success: boolean;
  message: string;
  result?: any;
}

export interface BatchCommentRequest {
  video_url: string;
  comments: {
    session_id: number;
    text: string;
  }[];
}

class AutoCommentService {
  private baseUrl = `${API_BASE_URL}/tiktok`;

  async postComment(sessionId: number, data: PostCommentRequest): Promise<PostCommentResponse> {
    const response = await axios.post(`${this.baseUrl}/session/${sessionId}/comment`, data);
    return response.data;
  }

  async postCommentBatch(data: BatchCommentRequest): Promise<any> {
    const response = await axios.post(`${this.baseUrl}/auto-comment`, data);
    return response.data;
  }
}

export const autoCommentService = new AutoCommentService();

