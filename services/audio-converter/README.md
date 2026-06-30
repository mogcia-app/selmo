# selmo audio converter

Cloud Run worker for converting uploaded WAV audio to mp3 and running long transcription jobs.

## Environment

- `AUDIO_CONVERTER_TOKEN`: shared bearer token. Must match the Next.js env var.
- `FIREBASE_STORAGE_BUCKET`: Firebase Storage bucket name. Example: `selmo-8397c.firebasestorage.app`.
- `OPENAI_API_KEY`: OpenAI API key used for transcription jobs.
- `GOOGLE_CLOUD_PROJECT`: set by Cloud Run.

## Endpoints

- `GET /health`
- `POST /kick`  
  Starts conversion for one meeting and returns immediately.
- `POST /convert`  
  Converts one meeting synchronously.
- `POST /kick-transcription`  
  Starts transcription for one meeting and returns immediately.
- `POST /transcribe`  
  Transcribes one meeting synchronously.
- `POST /process-pending`  
  Converts pending `audioProcessingJobs` with `status == "convert_required"`.
- `POST /process-transcription-pending`  
  Transcribes pending `audioProcessingJobs` with `status == "transcription_queued"`.

All POST endpoints require:

```http
Authorization: Bearer ${AUDIO_CONVERTER_TOKEN}
```

## Deploy Example

```bash
gcloud run deploy selmo-audio-converter \
  --source services/audio-converter \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars AUDIO_CONVERTER_TOKEN=... \
  --set-env-vars OPENAI_API_KEY=... \
  --set-env-vars FIREBASE_STORAGE_BUCKET=selmo-8397c.firebasestorage.app \
  --memory 1Gi \
  --cpu 1 \
  --timeout 3600 \
  --no-cpu-throttling
```

For reliable async processing, create Cloud Scheduler jobs to call `/process-pending` and `/process-transcription-pending`.
