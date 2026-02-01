import os
import anthropic
from elevenlabs.client import ElevenLabs
from dotenv import load_dotenv

load_dotenv()

# Initialize Clients
anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
el_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

def generate_commentary(event_json, persona_style):
    """
    Feeds raw JSON directly to Claude to generate FULL match commentary.
    """
    prompt = f"""You are a sports commentator with this style: {persona_style}.

You've been given event data from a tennis match tracking system. Your job is to create a CONTINUOUS, 
PLAY-BY-PLAY commentary that brings this match to life for a blind or visually impaired audience.

Here is the event data:
{event_json}

IMPORTANT INSTRUCTIONS:
1. Generate a FULL running commentary covering the ENTIRE match from start to finish
2. Describe each significant moment as it happens in chronological order
3. Focus on what matters to understanding the game:
   - When the ball bounces (rally continues)
   - When shots are hit (direction changes)
   - When the ball goes out (point ends)
   - Build excitement during long rallies
   - Note when play stops and restarts
4. Don't just list events - create a NARRATIVE that flows naturally
5. Use present tense as if calling it live ("The ball crosses the net... bounces deep... and it's OUT!")
6. Add context about what's happening tactically
7. This should be 1 minute of spoken commentary when read aloud
8. Think like a radio commentator - paint the picture with words

DO NOT mention "JSON", "events", "frameIndex" or technical terms.
DO NOT summarize - give the FULL play-by-play.

Generate the complete commentary now:"""
    
    response = anthropic_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,  # Increased for full commentary
        messages=[{"role": "user", "content": prompt}]
    )
    
    return response.content[0].text

def speak_text(text):
    """
    Uses the modern ElevenLabs client syntax to stream audio.
    """
    audio_stream = el_client.text_to_speech.convert(
        text=text,
        voice_id="JBFqnCBsd6RMkjVDRZzb", # 'George' voice ID
        model_id="eleven_turbo_v2",
        output_format="mp3_44100_128"
    )
    return audio_stream