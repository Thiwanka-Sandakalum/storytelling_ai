"""Dependency injection provider for the Interactive Storyteller service."""
import os
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from dotenv import load_dotenv
from agent import narrator_agent

# Load environment variables
load_dotenv()

# Global instances (initialized on first import)
APP_NAME = "interactive-storyteller"
_session_service = InMemorySessionService()
_runner = Runner(
    app_name=APP_NAME,
    agent=narrator_agent,
    session_service=_session_service,
)


def get_session_service() -> InMemorySessionService:
    """Provide the session service instance."""
    return _session_service


def get_runner() -> Runner:
    """Provide the ADK runner instance."""
    return _runner


def get_app_name() -> str:
    """Provide the global app name."""
    return APP_NAME
