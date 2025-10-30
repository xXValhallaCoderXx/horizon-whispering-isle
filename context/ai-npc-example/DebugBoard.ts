import * as hz from 'horizon/core'

// A list of active debug boards
let debugBoards: Map<string, DebugBoard> = new Map<string, DebugBoard>()

/**
 * Print a message to a debug board.  If a channel is specified, the message will go to that specific board.
 * @param message - The message to print.
 * @param channel - Optional. An identifier string for a specific board.
 * @returns 
 */
export function debuglog(message: string, channel?: string) {
    //console.log("exp DebugBoard.debuglog: " + message)
    if (channel) {
        var db = debugBoards?.get(channel)
        if (db) {
            db.formatLog(message)
            return
        }
    }
    // no target specified (or invalid target), so log to all boards
    if (debugBoards.size > 0) {
        debugBoards.forEach((dbgBoard) => {
            dbgBoard.formatLog(message)
        })
    }
}

/**
 * DebugBoard class;
 * 
 * A manager to route debug messages to the appropriate text box in the world, so that they are visible in game.
 * 
 * @parmam debugText - The text box object which will show the debug messages for this board.
 * @param identifier - An ID for routing messages to this board.
 * @param color - The text color for this board.
 */

class DebugBoard extends hz.Component<typeof DebugBoard> {
    static propsDefinition = {
        debugText: { type: hz.PropTypes.Entity },
        identifier: { type: hz.PropTypes.String },
        color: { type: hz.PropTypes.Color, default: hz.Color.black },
    }

    str: string[] = []
    maxLines: number = 5

    /**
     * Set up the debug board, add it to the board list.
     */
    start() {
        debugBoards.set(this.props.identifier, this)
        this.str = new Array(this.maxLines).fill('')
        this.props.debugText?.as(hz.TextGizmo).color.set(hz.Color.red)
        this.props.debugText?.as(hz.TextGizmo).text.set(this.props.identifier)
    }

    /**
     * Format the message with a timestamp, scroll old messages offscreen and print the current messages.
     * 
     * @param message - A new message to add to the debug board.
     */

    formatLog(message: string) {

        const currentDate = new Date()
        const minutes = String(currentDate.getMinutes()).padStart(2, "0")
        const seconds = String(currentDate.getSeconds()).padStart(2, "0")
        const milliseconds = String(currentDate.getMilliseconds()).padStart(3, "0")

        for (let i = this.maxLines - 1; i > 0; i--) {
            this.str[i] = this.str[i - 1]
        }
        this.str[0] = `${minutes}:${seconds}:${milliseconds} -- ` + message
        var dbgstr = this.str[0] + '\n'
        for (let i = 1; i < this.maxLines; i++) {
            dbgstr += this.str[i] + '\n'
        }

        if (this.props.debugText) {
            this.props.debugText?.as(hz.TextGizmo).color.set(this.props.color)
            this.props.debugText.as(hz.TextGizmo).text.set(dbgstr)
        } else {
            console.log(message)
        }
    }
}
hz.Component.register(DebugBoard)