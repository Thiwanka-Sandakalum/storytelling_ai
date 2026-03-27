"""S3 physical storage layer for TTS service."""
import asyncio
import os
import boto3
from typing import Optional
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()

class MediaStorage:
    def __init__(self):
        self.s3_url = os.getenv("S3_ENDPOINT_URL")
        self.access_key = os.getenv("S3_ACCESS_KEY")
        self.secret_key = os.getenv("S3_SECRET_KEY")
        self.bucket_name = os.getenv("S3_BUCKET_NAME", "storytelling-audio")
        self.region = os.getenv("S3_REGION", "us-east-1")

        s3_config = Config(signature_version="s3v4") if self.s3_url else None
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=self.s3_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region,
            config=s3_config,
        )

    async def get_story_text(self, story_id: str) -> Optional[str]:
        """Fetch story text content from S3.

        boto3 is synchronous; run it in a thread-pool executor so we never
        block the FastAPI event loop while the script downloads.
        """
        key = f"scripts/{story_id}.txt"
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.s3_client.get_object(Bucket=self.bucket_name, Key=key),
            )
            return response["Body"].read().decode("utf-8")
        except Exception:
            return None

# Global instance
storage = MediaStorage()
