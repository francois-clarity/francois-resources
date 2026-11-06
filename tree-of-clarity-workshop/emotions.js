/* Emotion vocabulary for the Tree of Clarity app.
   Source: Francois Esterhuizen's Emotional Language Wheel (mild ring first,
   then intense ring), plus the deeper words he offers most often in live
   sessions. UK spelling throughout. */
(function (global) {
  "use strict";

  var EMOTION_GROUPS = [
    {
      key: "sessions",
      label: "Heard often in sessions",
      words: [
        "Disrespected", "Rejected", "Unimportant", "Unseen", "Invisible",
        "Belittled", "Unsupported", "Not good enough", "Excluded",
        "Unappreciated", "Inadequate", "Powerless"
      ]
    },
    {
      key: "anger",
      label: "Anger",
      words: [
        "Frustrated", "Irritated", "Annoyed", "Agitated", "Grumpy", "Vexed",
        "Critical", "Sceptical", "Distant", "Peeved",
        "Exasperated", "Hostile", "Furious", "Aggressive", "Violated",
        "Enraged", "Indignant", "Hateful", "Resentful"
      ]
    },
    {
      key: "fear",
      label: "Fear",
      words: [
        "Worried", "Uneasy", "Nervous", "Uncomfortable", "Concerned",
        "Anxious", "Submissive", "Tense", "Exposed", "Apprehensive",
        "Horrified", "Humiliated", "Scared", "Helpless", "Overwhelmed",
        "Threatened", "Panicked", "Terrified"
      ]
    },
    {
      key: "sadness",
      label: "Sadness",
      words: [
        "Down", "Fragile", "Melancholy", "Pensive", "Apathetic", "Tired",
        "Disappointed", "Regretful",
        "Grief", "Ashamed", "Abandoned", "Inconsolable", "Despairing",
        "Anguished", "Hopeless", "Dismayed", "Remorseful"
      ]
    },
    {
      key: "surprise",
      label: "Surprise",
      words: [
        "Disconcerted", "Distracted", "Startled", "Perplexed", "Confused",
        "Wondering", "Unnerved", "Unsettled", "Incredulous", "Baffled",
        "Shocked", "Mortified", "Astonished", "Speechless", "Bewildered",
        "Dazed", "Stunned"
      ]
    },
    {
      key: "disgust",
      label: "Disgust",
      words: [
        "Bored", "Bothered", "Contemptuous", "Indifferent", "Judgemental",
        "Disapproving", "Hesitant", "Disdainful", "Embarrassed",
        "Loathing", "Sickened", "Appalled", "Nauseated", "Revolted",
        "Repelled", "Offended"
      ]
    },
    {
      key: "anticipation",
      label: "Anticipation",
      words: [
        "Cautious", "Expectant", "Pessimistic", "Vigilant", "Foreboding",
        "Cynical", "Giddy", "Restless", "On edge", "Dreading"
      ]
    },
    {
      key: "joy",
      label: "Joy",
      words: [
        "Serene", "Peaceful", "Thankful", "Mellow", "Happy", "Content",
        "Satisfied", "Hopeful", "Curious", "Interested",
        "Excited", "Courageous", "Passionate", "Powerful", "Elated",
        "Enthusiastic", "Delighted", "Proud", "Optimistic"
      ]
    },
    {
      key: "trust",
      label: "Trust",
      words: [
        "Accepting", "Tolerant", "Safe", "Sentimental", "Unconcerned",
        "Committed", "Convinced", "Reliable", "Loving", "Confident",
        "Admiring", "Supported", "Adoring"
      ]
    }
  ];

  /* Curated list for the emotional goals step: how would I rather want to
     feel, if the situation stays exactly the same. */
  var HEALTHY_EMOTIONS = [
    "Calm", "At peace", "Empowered", "Confident", "Safe", "Grounded",
    "Curious", "Hopeful", "Content", "Patient", "Steady", "Clear",
    "Open", "Free", "Strong", "Courageous", "Energised", "Playful",
    "Loving", "Loved", "Compassionate", "Connected", "Respected",
    "Grateful", "Proud", "Capable", "Present", "Light"
  ];

  var BODY_PLACES = [
    "Head", "Jaw or face", "Throat", "Chest", "Stomach",
    "Shoulders or neck", "Hands or arms", "Legs or feet", "Everywhere"
  ];

  global.TocEmotions = {
    groups: EMOTION_GROUPS,
    healthy: HEALTHY_EMOTIONS,
    bodyPlaces: BODY_PLACES
  };
})(window);
