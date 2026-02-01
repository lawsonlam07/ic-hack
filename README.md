# Ball Knowledge

This is our entry for IC Hack 26, entering in the Sports and Occam's Razor categories.

This is a proof of concept for an AI Sports Commentary analysing tennis gameplay.

The interface for our web app is sleek and intuitive. Using a minimalist approach, we have boiled the page down to its bare essentials as to not overwhelm the user.

<img width="717" height="591" alt="image" src="https://github.com/user-attachments/assets/e49f06bb-3ca9-4f9f-a282-1a1ce501cace" />

1. We provide a multimodal method of input: both a direct upload or a YouTube video link can be analysed.
2. The method of input is simple and intuitive.
3. A final layer of customisation allows the user to tailor the commentator's style to better suit their needs.

## Objectives
With this project we aim to solve two pressing problems:

**Personalisation** - This can be used to provide commentary for games that would not otherwise be analysed, in a style that best fits the listener. In the future, additional improvements could be made in order to allow the user to analyse their games and use the feedback to improve their style of play.

**Accessibility** - Not only will anybody from any background be able to engage with the sport, but it could also be used to help the visually impaired engaged with the game through audio cues.

## Social Impact
We built this project with the aim of providing blind fans with a data-rich experience in mind. It has the advantage of that doesn't rely on a human being available to describe it.

## Algorithms
A simplified rundown of the processes at work is as follows:
1. The user inputs a video to the server.
2. YOLO is used to track entities of interest based on their absolute position in pixels on the screen.
   - In particular, we track the players, ball and boundary box.
4. Planar homography is used to transform this into a top-down view in order to gauge the position of the ball relative to the playing field.
5. Next, collections of frames are analysed in order to mark them with an event.
   - For example, whether or not the ball has bounced in the frame, a shot has been taken, or the ball has hit the net.
7. This is then used to create a JSON file that we pass to Claude, which generates a running commentary.
8. ElevenLabs is then used to synthesise audio, which we can overlay on the original video.
9. This is then passed back to the website so the user can watch at their own enjoyment.

In the future, we could scale this to more sports. In particular, I would like to use this to analyse some of my Taekwondo sparring matches to identify my weaknesses that I can iron out before competitions.
