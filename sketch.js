// Other todos:

// Start by Binding Javascript function to
$("#startInterview").click(startInterview);

// let INTERVIEW_LENGTH_S = 0.10 * 60; // s
let INTERVIEW_LENGTH_S = 60; // s
let finishedInterviewLength = INTERVIEW_LENGTH_S;

// How fast the video recording updates - 1 second at a time
let INTERVIEW_UPDATE_S = 0.5; // s

// Config for face-api.js
const MODEL_URL = 'assets/models'
var FACE_API_READY = false;

setupFaceRecognition();
setupSelfieSegmentation();

function setupFaceRecognition() {
  // Need to ensure Chrome supports WEBGL:
  // https://www.interplaylearning.com/en/help/how-to-enable-webgl-in-chrome
  faceapi.loadSsdMobilenetv1Model(MODEL_URL).then(() => {
    console.log('loaded SSD model');

    faceapi.loadFaceExpressionModel(MODEL_URL).then(() => {
      console.log('loaded Face Expression Model');

      FACE_API_READY = true;
    });
  });
}

var selfieSegmentation;
function setupSelfieSegmentation() {
  selfieSegmentation = new SelfieSegmentation({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
  }});
  selfieSegmentation.setOptions({
    modelSelection: 1,
  });
  selfieSegmentation.onResults(processVideoFrame);

  console.log("Loaded selfie segmentation model");
}

function getSelectedJob() {
  var jobDescriptions = $("#jobDescriptions button");

  var selectedJob = null;
  jobDescriptions.each((id, button) => {
    var isExpanded = $(button).attr("aria-expanded").toLowerCase();
    if (isExpanded == "true") {
      selectedJob = $(button).attr("data-value");
    }
  });

  return selectedJob;
}

function startInterview() {
  // TODO: send to the top of the page

  // var jobName = "rideshare";
  var jobName = getSelectedJob();
  console.log('jobName', jobName);

  if (jobName == null) {
    $("#startInterviewError").show();
    return;

  } else {
    $("#startInterviewError").hide();
  }

  // Update the content
  // TODO add random questions - and relfect the job name
  $("#introContent").hide();
  updateQuestionContent(jobName);
  $("#questionContent").show();

  // Start Recording: Audio + Visual
  setupSpeechRecognition();
  setupCamera();

  console.log("starting interview...");
  speechRecognition.start();
  camera.start();


  var timeLeft = INTERVIEW_LENGTH_S;

  $("#doneInterview").click(() => {
    console.log("clicked!");
    finishedInterviewLength = INTERVIEW_LENGTH_S - timeLeft;

    timeLeft = 0;
    updateProgressBar(timeLeft, INTERVIEW_LENGTH_S);
  });

  let myInterval = setInterval(
    () => {
      if (timeLeft <= 0) {
        console.log("Finished interview...");

        speechRecognition.stop();
        camera.stop();
        clearInterval(myInterval);

        console.log("interviewFeatures", interviewFeatures);

        var results = analyzeInterview(jobName, interviewFeatures);
        showResults(results);

      } else {
        timeLeft -= INTERVIEW_UPDATE_S;

        updateProgressBar(timeLeft, INTERVIEW_LENGTH_S);

      }
    }, INTERVIEW_UPDATE_S * 1000
  );
}

function updateQuestionContent(jobName) {
  $("#jobNameTitle").text(interviewKey[jobName].title);
  $("#jobDescription").text(interviewKey[jobName].description);
}

var interviewFeatures = {
  frames: [],
  interimTranscript: "",
  finalTranscript: "",
  get transcript() {
    return this.finalTranscript + " " + this.interimTranscript;
  }
};

function showResults(results) {
  console.log('Current interview features:', results, interviewFeatures);

  var hireDecision = $("#resultBadge");

  if (results.hire) {
    hireDecision.text("HIRE");
    hireDecision.addClass("bg-success");
  } else {
    hireDecision.text("NO HIRE");
    hireDecision.addClass("bg-danger");
  }

  // Toggle Left Column
  $("#questionContent").hide();
  $("#resultsContent").show();

  // Toggle Right Column
  $("#video_recording_panel").hide();
  $("#video_review_panel").show();

  var currentTranscript = interviewFeatures.transcript;
  console.log("transcript:", currentTranscript, $("#edit_transcript"));
  $("#edit_transcript").val(currentTranscript);

  // Edit HTML of features
  updateFeatureResultsHTML(results);

  // Set up Reanalyze
  $("#reanalyzeInterview").click(reanalyzeResults);

  // Play video interview back
  setUpFilters();
  startAnimation(24);
  // window.requestAnimationFrame(playbackSubmission);
}

function updateFeatureResultsHTML(results) {
  let LIST_HIGHLIGHT_CLASS = "list-group-item-primary";

  var resultFeatures = results.verbal.concat(results.visual);
  console.log(resultFeatures);

  resultFeatures.forEach((item) => {

      var scoreId = "#" + item.id + 'Score';
      var resultList = $(scoreId + " li");

      resultList.each((i, listItem) => {
        var scoreValueId = item.value || 0;
        if (i == scoreValueId) {
          $(listItem).addClass(LIST_HIGHLIGHT_CLASS);
        } else {
         $(listItem).removeClass(LIST_HIGHLIGHT_CLASS)
        }
      });

  });

  var currentWPM = results.transcript.split(' ').length / (finishedInterviewLength / 60);
  currentWPM = Math.round(currentWPM);
  $("#wpm").text(currentWPM);
  console.log("WPM", currentWPM);
}

var startReanalyze = false;
var updatedInterviewFeatures = {
  frames: [],
  transcript: ""
};

function reanalyzeResults() {
  console.log("Starting reanlysis...");

  $("#reanalyzeInterview").prop('disabled', true);
  $("#reanalyzeInterview").text("Analyzing Interview...");
  startReanalyze = true;
  finishedReanalyze = false;
  frameIdx = 0;
}

function finishReanalysis() {
  updatedInterviewFeatures.transcript = $("#edit_transcript").val();

  var jobName = getSelectedJob();
  var newResults = analyzeInterview(jobName, updatedInterviewFeatures);

  console.log("finished analysis", updatedInterviewFeatures, newResults)

  updateFeatureResultsHTML(newResults);
  $("#reanalyzeInterview").prop('disabled', false);
  $("#reanalyzeInterview").text("Reanalyze Interview");


}

var frameIdx = 0;
const NO_FILTER = {
  name: 'noFilter',
  filter: noFilter
};
const ZOOM_BG = {
  name: 'zoomBg',
  filter: zoomBgFilter
};
const BC_FILTER = {
  name: 'brightnessContrast',
  filter: bcFilter
};
var videoFilter = NO_FILTER;
var computeFilterFeatures = false;

function setUpFilters() {
  $("#zoomBg").click(filterClick(ZOOM_BG));
  $("#brightContrast").click(filterClick(BC_FILTER));
}

function filterClick(filter) {
  return () => {
    if (videoFilter.name == filter.name) {
      videoFilter = NO_FILTER;
    } else {
      videoFilter = filter;
    }

    frameIdx = 0;
  };
}

var frameCount = 0;
var fps, fpsInterval, startTime, now, then, elapsed;

function startAnimation(fps) {
  fpsInterval = 1000 / fps;
  then = Date.now();
  startTime = then;
  playbackSubmission();
}

function playbackSubmission() {

  window.requestAnimationFrame(playbackSubmission);

  now = Date.now();
  elapsed = now - then;
  if (elapsed > fpsInterval) {

    then = now - (elapsed % fpsInterval);
    const canvas = document.getElementById("video_output");
    const ctx = canvas.getContext('2d');

    var frame = interviewFeatures.frames[frameIdx];
    videoFilter.filter(canvas, ctx, frame);
    drawFacialBox(canvas, ctx, frame);

    if (startReanalyze) {
      var newFrame = { };
      measureInterviewFeatures(canvas, newFrame, NO_FILTER.name);
      updatedInterviewFeatures.frames.push(newFrame);
    }

    frameIdx = (frameIdx + 1)
    if (frameIdx >= interviewFeatures.frames.length) {
      frameIdx = 0;

      // Completed a cycle and "finished"
      if (startReanalyze) {
        startReanalyze = false;
        finishReanalysis();
      }
    }

    // TESTING...Report #seconds since start and achieved fps.
    var sinceStart = now - startTime;
    var currentFps = Math.round(1000 / (sinceStart / ++frameCount) * 100) / 100;
    // console.log("Elapsed time= " + Math.round(sinceStart / 1000 * 100) / 100 + " secs @ " + currentFps + " fps.");
  }

}

function noFilter(canvas, ctx, frame) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = "brightness(100%) saturate(100%)";

  ctx.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
}

function zoomBgFilter(canvas, ctx, frame) {
  var bgImage = document.getElementById("zoomBg");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = "brightness(100%) saturate(100%)";

  ctx.drawImage(frame.segmentationMask, 0, 0,
                      canvas.width, canvas.height);

  // Only overwrite missing pixels.
  ctx.globalCompositeOperation = 'source-out';

  ctx.drawImage(
      bgImage, 0, 0, canvas.width, canvas.height
  );

  // Only overwrite missing pixels.
  ctx.globalCompositeOperation = "destination-atop";
  ctx.drawImage(
      frame.image, 0, 0, canvas.width, canvas.height
  );

  ctx.globalCompositeOperation = 'source-over';
}

function bcFilter(canvas, ctx, frame) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = "brightness(50%) saturate(200%)";
  ctx.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
}

function drawFacialBox(canvas, ctx, frame) {
  var faceData = frame[NO_FILTER.name];
  // faceapi.matchDimensions(canvas, {width: 640, height: 480});
  if (faceData != undefined) {
    faceapi.draw.drawDetections(canvas, faceData);
    faceapi.draw.drawFaceExpressions(canvas, faceData);
  }
}

const interviewKey = {
  rideshare: {
    title: "Rideshare Driver",
    description: "Drivers on our rideshare will sometimes encounter difficult passengers. Therefore we need safe drivers who can put on a serious face.",
    keywords: [
      "safe",
      "driver",
      "road signs",
      "local streets",
      "customer happy",
      "good driver",
      "world class",
      "driving years",
      "seatbelts",
      "shortcuts"
    ],
    emotion: 'angry'
  },
  dogwalker: {
    title: "Dog Walker",
    description: "Taking care of many dogs requires somemone with an upbeat and happy attitude.",
    keywords: [
      "dog",
      "friendly",
      "on time",
      "workout",
      "physical stamina",
      "multiple dogs",
      "avoid cars",
      "avoid people",
      "client happy",
      "dog sick"
    ],
    emotion: 'happy'
  },
  proofreader: {
    title: "Essay Proofreader",
    description: "A good essay proofreader will be objective and fair. Thus, we want someone can keep a neutral approach.",
    keywords: [
      "detail-oriented",
      "good grades",
      "vocabulary",
      "grammar",
      "meticulous",
      "spelling",
      "plagiarism",
      "communicate",
      "writing",
      "company guidelines"
    ],
    emotion: 'neutral'
  },
}

function analyzeInterview(jobName, features) {
  let rc = {
    jobName: jobName,
    verbal: [],
    visual: [],
    hire: false,
    transcript: features.transcript
  };

  let speakingFluency = analyzeSpeakingFluency(features);
  rc.verbal.push(speakingFluency);

  let jobFit = analyzeJobFitKeywords(features, jobName);
  rc.verbal.push(jobFit);

  let personalityFit = analyzePersonalityFit(features, jobName);
  rc.visual.push(personalityFit);

  // Need Intermediate Score + Developing Speech Fluency
  // if ((jobFit.value => 3) && (personalityFit.value => 3) && (speakingFluency >= 1)) {
  //   rc.hire = true;
  // }

  console.log("interview results", rc);
  return rc;
}

function analyzeSpeakingFluency(interviewFeatures) {
  let rc = {
    id: "fluency",
    title: "Speech Fluency",
    description: "We evaluate how normative your speech patterns are. Are you speaking at the right pace?",
    value: -1 // 0-4
  };

  let finalTranscript_words = interviewFeatures.transcript.split(' ');
  let wordsPerMin = finalTranscript_words.length / (finishedInterviewLength / 60);

  // Compute score normal distribution Z-score
  // mean = 140 words per minutes
  // standard deviation = 20 words per minute
  const mean = 140,
        std = 20;
  var z_score = (wordsPerMin - mean) / std;  // will be likely betwee -3 and 3
  var finalScore = 4 - (Math.abs(z_score) * 2); // reduce score for every 1/2 standard deviation
  finalScore = Math.max(finalScore, 0);
  finalScore = Math.round(finalScore);
  // where 5 = mean average words per minutes
  rc.value = finalScore;

  console.log("Fluency", wordsPerMin, z_score, finalScore);

  return rc;
}

function analyzeJobFitKeywords(interviewFeatures, jobName) {
  let rc = {
    id: "jobFit",
    title: "Job Fit",
    description: "We evaluate whether you are the right fit for the job description based on the keywords you use in your response.",
    value: -1 // 0-4
  };

  let finalTranscript_set = new Set(interviewFeatures.transcript.split(' '));
  let jobKeywords = interviewKey[jobName].keywords;

  var score = 0;
  var maxScore = jobKeywords.length;
  jobKeywords.forEach((item) => {
    var allPresent = true;
    var keywords = item.split(' ');
    keywords.forEach((word) => {
      // If any word is not in the set -> break to false
      if (!finalTranscript_set.has(word)) {
        allPresent = false;
      }
      // If all are in the set - allPresent will remain true
    });
    if (allPresent) {
      score += 1;
    }
  });

  // 100% => 4 / 80-100% => 3
  // 0, 1, 2, 3, 4
  // 0-25%, 25-50%, 50-75%, 75-100%, 100%
  var percentageScore = 4 * (score / maxScore);
  var finalScore = Math.round(percentageScore);
  rc.value = finalScore;

  console.log("Job Fit", score, maxScore, percentageScore, finalScore);
  console.log(finalTranscript_set, jobKeywords);

  return rc;
}

function analyzePersonalityFit(interviewFeatures, jobName) {
  let rc = {
    id: "personalityFit",
    title: "Personality Fit",
    description: "We evaluate your personality using facial expressions and compare it to the preferred personality of the job description.",
    value: -1 // 0-4
  };

  // For each frame - this looks at the most prevalent emotion
  // and outputs a score based on what percentage of interviewer's emotions'
  // correspond with the target emotion
  var targetEmotion = interviewKey[jobName].emotion;

  // defaultDictionary from
  // https://stackoverflow.com/questions/19127650/defaultdict-equivalent-in-javascript
  var emotionCounts  = new Proxy({}, {
    get: (target, name) => name in target ? target[name] : 0
  });

  var score = 0,
      maxScore = 0;

  // For each expression: calculate the top emotion and
  // increment the score if it matches target emotion
  interviewFeatures.frames.forEach((frame, i) => {
    var frameExpression = frame['noFilter'];
    if (frameExpression != undefined) {
      maxScore += 1;

      var topEmotion;
      var topScore = 0;
      Object.entries(frameExpression.expressions).forEach((entry) => {
        const [key, value] = entry;
        if (value > topScore) {
          topEmotion = key;
          topScore = value;
        }
      });

      if (topEmotion == targetEmotion) { score += 1; };

      emotionCounts[topEmotion] += 1;
    }
  });

  var percentageScore = 4 * (score / maxScore);
  var finalScore = Math.round(percentageScore);
  rc.value = finalScore;

  console.log("Personality Fit", score, maxScore, percentageScore, finalScore, targetEmotion, emotionCounts);

  return rc;
}

function processVideoFrame(results) {
  // Results is a object including:
  // results = { image, segmentationMask, }
  measureInterviewFeatures("video_element", results, NO_FILTER.name);

  interviewFeatures.frames.push(results);

}

function measureInterviewFeatures(video_id, results, featureName, overwrite = false) {
  // TODO test with image....
  // we need to pass in an image Bitmap and make it vs. rely on video tag...

  if(!(featureName in results)) {
    results[featureName] = undefined;
  }
  else {
    if (overwrite || results[featureName] == undefined) {
      console.log("overwriting feature data");
    } else {
      return;
    }
  }
  if(FACE_API_READY) {
    faceapi.detectSingleFace(video_id).withFaceExpressions().then((data) => {
       results[featureName] = data;
    });
  }
}

function updateProgressBar(timeLeft, totalTime) {
  var progressBar = $("#progressBar");
  var progressLabel = $("#progressLabel");

  var minLeft = Math.floor(timeLeft / 60);
  var secLeft = Math.round(timeLeft - (minLeft * 60));

  // TODO: add float formatting - somehow?
  secLeft = secLeft.toString();
  if (secLeft.length < 2) { secLeft = "0" + secLeft; }
  progressLabel.text(`${minLeft}:${secLeft}`);

  var percentage = Math.round((1 - (timeLeft / totalTime)) * 100);
  progressBar.css("width", `${percentage}%`);
  progressBar.attr("aria-valuenow", `${percentage}`);

}

// TODO refactor?
var speechRecognition;

// TODO sooooo this might go out to the internet?
// what is the data privacy here?
function setupSpeechRecognition() {
  var SpeechRecognition = SpeechRecognition || webkitSpeechRecognition;
  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;

  speechRecognition.onstart = (event) => {
    console.log('Speech recognition starting');
  }

  speechRecognition.onerror = (error) => {
    console.log("Error with speech recognition", error);
  }

  speechRecognition.onend = () => {
    console.log('Spech recognition ending');
  }

  speechRecognition.onresult = (event) => {
    // Create the interim transcript string locally because we don't want it to persist like final transcript
    interviewFeatures.interimTranscript = "";

    // Loop through the results from the speech recognition object.
    for (var i = event.resultIndex; i < event.results.length; ++i) {
      // If the result item is Final, add it to Final Transcript, Else add it to Interim transcript
      if (event.results[i].isFinal) {
        interviewFeatures.finalTranscript += event.results[i][0].transcript;
      } else {
        interviewFeatures.interimTranscript += event.results[i][0].transcript;
      }
    }

    $("#final_transcript").val(interviewFeatures.transcript);

    // document.querySelector("#final_transcript").innerHTML = interviewFeatures.finalTranscript;
    // document.querySelector("#interim_transcript").innerHTML = interviewFeatures.interimTranscript;
  }

  console.log("Finished loading SpeechRecognition");
}

let camera;
function setupCamera() {
  let videoElement = document.getElementById("video_element");
  camera = new Camera(videoElement, {
    onFrame: async () => {
      console.log('new camera frame');
      await selfieSegmentation.send({image: videoElement});
    },
    width: 640,
    height: 480
  });

  return camera;
}
