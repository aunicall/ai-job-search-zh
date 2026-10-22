import { z } from "zod";

// 开放接口按完整城市名匹配；只转换明确的常用城市简称，保留其他原始条件。
const offerCityNames = new Set("北京 上海 天津 重庆 广州 深圳 杭州 成都 武汉 西安 南京 长沙 郑州 苏州 厦门 合肥 福州 大连 青岛 宁波 济南 无锡 东莞 佛山 珠海 沈阳 长春 哈尔滨 石家庄 太原 南昌 南宁 昆明 贵阳 海口 兰州 银川 西宁 乌鲁木齐 拉萨 呼和浩特".split(" "));
export const offerQuerySchema = z.object({
  keywords: z.string().trim().max(100),
  city: z.string().trim().max(50).transform((city) => offerCityNames.has(city) ? `${city}市` : city),
  graduationYear: z.number().int().min(2020).max(2050).optional(),
  cursor: z.string().max(3000).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});
const optionalText = z.string().nullable().optional();
export const offerItemSchema = z
  .object({
    id: z.string(),
    enterpriseName: optionalText,
    recruitInfoName: optionalText,
    positionName: optionalText,
    workPlace: optionalText,
    city: optionalText,
    location: optionalText,
    educationLevel: optionalText,
    content: optionalText,
    recruitPosInfoNameList: optionalText,
    cityNameList: optionalText,
    education: optionalText,
    url: optionalText,
    announcementUrl: optionalText,
    richText: optionalText,
    endTime: optionalText,
    updateTime: optionalText,
    releaseSource: optionalText,
  })
  .passthrough();
export type OfferItem = z.infer<typeof offerItemSchema>;
export interface OfferResults {
  items: OfferItem[];
  nextCursor: string | null;
  hasMore: boolean;
}
export function decodeOfferResponse(value: unknown): OfferResults {
  const envelope = z
    .object({ code: z.number(), data: z.unknown().optional() })
    .parse(value);
  const messages: Record<number, string> = {
    7001: "Offer先生密钥无效，请检查配置。",
    7002: "Offer先生密钥已撤销，请更换密钥。",
    7003: "Offer先生本月额度已用完，请等待额度重置。",
    7004: "Offer先生请求过于频繁，请稍后查询。",
  };
  if (envelope.code !== 1000)
    throw new Error(
      messages[envelope.code] || "Offer先生暂时无法提供数据，请稍后查询。",
    );
  return z
    .object({
      items: z.array(offerItemSchema).max(100),
      nextCursor: z
        .string()
        .nullable()
        .optional()
        .transform((v) => v || null),
      hasMore: z.boolean(),
    })
    .parse(envelope.data);
}
export async function searchOffer(query: z.infer<typeof offerQuerySchema>, signal?: AbortSignal) {
  if (!process.env.OFFER_CAMPUS_API_KEY) throw new Error("请先在本地环境配置 Offer先生开放平台密钥，再重启服务。");
  const { getSettings } = await import("./db");
  const { generate } = await import("./engines");
  const { useOfferSkill } = await import("./offer-skill");
  const settings = getSettings();
  const { offerSkillPrompt } = await import("./offer-skill-install");
  return useOfferSkill(query, (url) => generate(settings.engine, settings.engines[settings.engine],
    offerSkillPrompt(settings.engine), signal, { url }), signal, settings.engine);
}

export async function requestOffer(query: z.infer<typeof offerQuerySchema>, signal?: AbortSignal) {
  const key = process.env.OFFER_CAMPUS_API_KEY;
  if (!key)
    throw new Error("请先在本地环境配置 Offer先生开放平台密钥，再重启服务。");
  const response = await fetch(
    "https://openapi.offerxiansheng.com/backend-service/open/v1/campus-recruit/search",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...query, limit: query.limit ?? 20 }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      cache: "no-store",
      redirect: "error",
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Offer先生请求过于频繁，请稍后查询。"
        : "Offer先生服务暂不可用，请检查网络或密钥。",
    );
  const text = await response.text();
  if (text.length > 3_000_000)
    throw new Error("职位来源返回数据过大，请缩小查询范围。");
  return decodeOfferResponse(JSON.parse(text));
}
