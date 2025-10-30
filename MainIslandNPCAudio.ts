import * as hz from 'horizon/core';

export class MainIslandNPCAudio extends hz.Component<typeof MainIslandNPCAudio> {
  static propsDefinition = {
    // First greeting clips (when player lands for first time)
    firstGreeting01: { type: hz.PropTypes.Entity },
    firstGreeting02: { type: hz.PropTypes.Entity },

    // Return greeting clips (when player returns)
    returnGreeting01: { type: hz.PropTypes.Entity },
    returnGreeting02: { type: hz.PropTypes.Entity },

    // Idle chatter clips (optional, for future use)
    idleChatter01: { type: hz.PropTypes.Entity },
    idleChatter02: { type: hz.PropTypes.Entity },

    // Farewell clips (optional, for future use)
    farewell01: { type: hz.PropTypes.Entity },
  };

  // Audio clip arrays
  private firstGreetings: (hz.AudioGizmo | undefined)[] = [];
  private returnGreetings: (hz.AudioGizmo | undefined)[] = [];
  private idleChatter: (hz.AudioGizmo | undefined)[] = [];
  private farewells: (hz.AudioGizmo | undefined)[] = [];

  /**
   * Initialize audio arrays from props
   */
  preStart() {
    // Map entity props to AudioGizmo arrays
    this.firstGreetings = [
      this.props.firstGreeting01,
      this.props.firstGreeting02,
    ].map(e => e?.as(hz.AudioGizmo));

    this.returnGreetings = [
      this.props.returnGreeting01,
      this.props.returnGreeting02,
    ].map(e => e?.as(hz.AudioGizmo));

    this.idleChatter = [
      this.props.idleChatter01,
      this.props.idleChatter02,
    ].map(e => e?.as(hz.AudioGizmo));

    this.farewells = [
      this.props.farewell01,

    ].map(e => e?.as(hz.AudioGizmo));

    console.log("[IslandNPCAudio] Audio system initialized");
  }

  start(): void {

  }

  /**
   * Play a random audio clip from an array
   */
  private playRandom(clips: (hz.AudioGizmo | undefined)[]): void {
    // Filter out undefined clips
    const validClips = clips.filter(clip => clip !== undefined) as hz.AudioGizmo[];

    if (validClips.length === 0) {
      console.warn("[IslandNPCAudio] No valid audio clips to play");
      return;
    }

    // Select random clip
    const index = Math.floor(Math.random() * validClips.length);
    const selectedClip = validClips[index];

    console.log(`[IslandNPCAudio] Playing audio clip ${index + 1} of ${validClips.length}`);
    selectedClip.play();
  }

  // ==================== PUBLIC API ====================

  /**
   * Play first greeting (random selection)
   */
  public playFirstGreeting(): void {
    console.log("[IslandNPCAudio] Playing first greeting");
    this.playRandom(this.firstGreetings);
  }

  /**
   * Play return greeting (random selection)
   */
  public playReturnGreeting(): void {
    console.log("[IslandNPCAudio] Playing return greeting");
    this.playRandom(this.returnGreetings);
  }

  /**
   * Play idle chatter (random selection)
   */
  public playIdleChatter(): void {
    console.log("[IslandNPCAudio] Playing idle chatter");
    this.playRandom(this.idleChatter);
  }

  /**
   * Play farewell (random selection)
   */
  public playFarewell(): void {
    console.log("[IslandNPCAudio] Playing farewell");
    this.playRandom(this.farewells);
  }
}
hz.Component.register(MainIslandNPCAudio);