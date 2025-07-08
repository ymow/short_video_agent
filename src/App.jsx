import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, Video, Image, FileText } from 'lucide-react';

// --- 組態設定 ---
const CREATOMATE_API_KEY = import.meta.env.VITE_CREATOMATE_API_KEY;
const CREATOMATE_API_URL = 'https://api.creatomate.com/v1/renders';

// 重要：API 金鑰現在從環境變數讀取以確保安全性
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY; 

const creatomateTemplateId = "006ce3c2-c215-4f2b-b38b-3ed184336793";

// --- AI 模型輔助函數 ---

/**
 * 要求 Gemini AI 根據文字提示生成影片腳本（包含圖片描述）。
 */
const createVideoBlueprintFromAI = async (promptText) => {
    console.log(`🤖 AI (Text) 正在為以下提示創建腳本: "${promptText}"`);
    const structuredPrompt = `
        您是一位專業的影片製作人。您的任務是根據用戶的請求，生成一個用於後續處理的 JSON 物件。
        用戶請求: "${promptText}"
        您必須生成一個 JSON 物件，其中包含兩部分：一個 "text_modifications" 物件和一個 "image_prompts" 物件。

        1.  **"text_modifications" 物件**: 包含所有文字資訊，例如旁白內容、標題、時間戳等。
        2.  **"image_prompts" 物件**: 包含 6 個鍵 ("photo_1_prompt" 到 "photo_5_prompt", 以及 "agent_photo_prompt")。每個鍵的值都應該是一段**詳細的、用於 AI 圖片生成的英文描述**。這些描述應該具體、富有畫面感，以便生成高品質的圖片。描述應該完全符合用戶請求的內容主題。例如，如果用戶要求汽車歷史影片，應該生成："A historical black and white photograph of the 1886 Benz Patent-Motorwagen, the world's first automobile, displayed in a vintage setting"。

        重要：僅輸出原始的 JSON 物件，不要用 markdown 包裝。
    `;
    
    const textApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(textApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: structuredPrompt }] }] })
    });

    if (!response.ok) throw new Error(`Gemini 文字生成失敗: ${response.statusText}`);
    
    const result = await response.json();
    const text = result.candidates[0].content.parts[0].text;
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    console.log('   - AI (Text) 已生成腳本。');
    return JSON.parse(cleanedText);
};

/**
 * 要求 Gemini AI 根據文字提示生成圖片。
 */
const generateImageFromAI = async (imagePrompt) => {
    console.log(`🎨 AI (Image) 正在為以下提示創建圖片: "${imagePrompt}"`);

    // 使用 Creatomate 的代理來調用 Gemini，因為它處理了身份驗證和速率限制
    const imageApiUrl = 'https://creatomate.com/api/v1/images';

    const response = await fetch(imageApiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${CREATOMATE_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt: imagePrompt,
            // 確保圖片尺寸與範本中的占位符相符
            output_width: 800,
            output_height: 600,
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`AI 圖片生成失敗: ${response.statusText} - ${errorBody}`);
    }

    const result = await response.json();
    const imageUrl = result[0].url;

    console.log(`   - ✅ AI (Image) 已生成圖片: ${imageUrl}`);
    return imageUrl;
};

// --- 主應用程式組件 ---

export default function App() {
    const [prompt, setPrompt] = useState('');
    const [status, setStatus] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [finalVideoUrl, setFinalVideoUrl] = useState(null);

    // 檢查 API 金鑰是否已設定
    React.useEffect(() => {
        if (!GEMINI_API_KEY) {
            setStatus('錯誤：GEMINI_API_KEY 環境變數未設定');
            console.error('GEMINI_API_KEY is not set');
        }
        if (!CREATOMATE_API_KEY) {
            setStatus('錯誤：CREATOMATE_API_KEY 環境變數未設定');
            console.error('CREATOMATE_API_KEY is not set');
        }
    }, []);

    const handleGeneratePreview = async () => {
        if (!prompt) {
            alert('請輸入提示文字。');
            return;
        }

        setIsLoading(true);
        setPreviewData(null);
        setFinalVideoUrl(null);
        
        try {
            setStatus('步驟 1/2: AI 正在撰寫腳本...');
            const blueprint = await createVideoBlueprintFromAI(prompt);

            setStatus('步驟 2/2: AI 正在循序生成圖片... (這可能需要 1-2 分鐘)');
            const imagePrompts = blueprint.image_prompts;
            const imageKeys = Object.keys(imagePrompts);
            const generatedImages = [];

            for (let i = 0; i < imageKeys.length; i++) {
                const key = imageKeys[i];
                const imagePrompt = imagePrompts[key];
                setStatus(`步驟 2/2: AI 正在生成第 ${i + 1}/${imageKeys.length} 張圖片...`);
                const generatedImage = await generateImageFromAI(imagePrompt);
                generatedImages.push(generatedImage);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 短暫延遲
            }
            
            setPreviewData({
                text_modifications: blueprint.text_modifications,
                generated_images: generatedImages,
            });
            setStatus('預覽生成完畢！請確認內容並開始製作影片。');

        } catch (error) {
            console.error(error);
            setStatus(`錯誤：${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateVideo = async () => {
        if (!previewData) {
            alert('沒有可用的預覽資料。');
            return;
        }

        setIsLoading(true);
        setStatus('正在發送資料至影片引擎進行渲染...');

        try {
            // 使用生產環境圖片 URL
            console.log('使用生產環境圖片 URL:', previewData.generated_images.map(img => ({
                url: img,
                isProductionUrl: !img.startsWith('data:image/')
            })));

            const imageModifications = {
                "Photo-1.source": previewData.generated_images[0],
                "Photo-2.source": previewData.generated_images[1],
                "Photo-3.source": previewData.generated_images[2],
                "Photo-4.source": previewData.generated_images[3],
                "Photo-5.source": previewData.generated_images[4],
                "Picture.source": previewData.generated_images[5],
            };

            const finalPayload = {
                template_id: creatomateTemplateId,
                modifications: {
                    ...previewData.text_modifications,
                    ...imageModifications,
                },
            };

            const response = await fetch(CREATOMATE_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CREATOMATE_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(finalPayload)
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data[0]?.message || 'Creatomate API 錯誤');
            }

            setStatus('影片渲染中，請稍候...');
            
            // 這裡我們假設渲染很快完成，在真實應用中應使用 Webhook 或輪詢來檢查狀態
            setTimeout(() => {
                setFinalVideoUrl(data[0].url);
                setStatus('影片製作完成！');
                setIsLoading(false);
            }, 8000); // 等待 8 秒

        } catch (error) {
            console.error(error);
            setStatus(`錯誤：${error.message}`);
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background p-4 flex justify-center items-center">
            <Card className="w-full max-w-4xl">
                <CardHeader className="text-center">
                    <CardTitle className="text-3xl font-bold flex items-center justify-center gap-2">
                        <Video className="w-8 h-8" />
                        AI 影片工作室
                    </CardTitle>
                    <p className="text-muted-foreground">輸入任何主題的描述，讓 AI 生成腳本與所有圖片，並製作成影片。</p>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <Textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={3}
                            placeholder="例如：汽車歷史從 1886 年第一台汽車到現代電動車的演變過程..."
                            disabled={isLoading}
                        />
                        <Button
                            onClick={handleGeneratePreview}
                            className="w-full"
                            disabled={isLoading}
                            size="lg"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    正在生成...
                                </>
                            ) : (
                                <>
                                    <FileText className="w-4 h-4 mr-2" />
                                    生成預覽
                                </>
                            )}
                        </Button>
                    </div>

                    {status && (
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-center space-x-3">
                                    {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                                    <p className="text-sm font-medium">{status}</p>
                                </div>
                                {isLoading && (
                                    <Progress value={33} className="mt-4" />
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {previewData && !finalVideoUrl && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Image className="w-5 h-5" />
                                    預覽內容
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {previewData.generated_images.map((imgSrc, index) => (
                                        <div key={index} className="relative">
                                            <img 
                                                src={imgSrc} 
                                                alt={`Generated preview ${index + 1}`} 
                                                className="w-full h-32 object-cover rounded-lg" 
                                            />
                                            <Badge className="absolute top-2 left-2 text-xs">
                                                {index + 1}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                                <Card className="bg-muted">
                                    <CardContent className="pt-6">
                                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap overflow-x-auto">
                                            {JSON.stringify(previewData.text_modifications, null, 2)}
                                        </pre>
                                    </CardContent>
                                </Card>
                                <Button
                                    onClick={handleCreateVideo}
                                    className="w-full"
                                    disabled={isLoading}
                                    size="lg"
                                    variant="default"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            製作中...
                                        </>
                                    ) : (
                                        <>
                                            <Video className="w-4 h-4 mr-2" />
                                            開始製作影片
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {finalVideoUrl && (
                        <Card className="border-green-200 bg-green-50">
                            <CardHeader className="text-center">
                                <CardTitle className="text-green-800 flex items-center justify-center gap-2">
                                    <Video className="w-6 h-6" />
                                    渲染完成！
                                </CardTitle>
                                <p className="text-green-700">您的影片已準備就緒。</p>
                            </CardHeader>
                            <CardContent className="text-center">
                                <Button asChild className="bg-green-600 hover:bg-green-700">
                                    <a href={finalVideoUrl} target="_blank" rel="noopener noreferrer">
                                        點此查看或下載影片
                                    </a>
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

