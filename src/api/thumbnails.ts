import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, getVideos, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const MAX_UPLOAD_SIZE = 10 << 20;

const videoThumbnails: Map<string, Thumbnail> = new Map();

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
}

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const formData = req.formData()
  const thumbnail = (await formData).get('thumbnail')

  if (!(thumbnail instanceof File)) throw new BadRequestError('Unable to parse File')
  if (thumbnail.size > MAX_UPLOAD_SIZE) throw new BadRequestError('File too large. Must be 10MB or smaller.')

  const mediaType = thumbnail.type
  const thumbnailData = await thumbnail.arrayBuffer()

  const video = getVideo(cfg.db, videoId)


  if (video?.userID !== userID) throw new UserForbiddenError('404')

  videoThumbnails.set(videoId, { data: thumbnailData, mediaType })

  const thumbnailURL = `http://localhost:${cfg.port}/api/thumbnails/${videoId}`

  video.thumbnailURL = thumbnailURL

  updateVideo(cfg.db, video)

  return respondWithJSON(200, video);
}
