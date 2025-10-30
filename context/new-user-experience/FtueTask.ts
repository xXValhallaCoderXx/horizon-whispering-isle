import { FtueChapter } from 'FtueChapter';
import { Component, Player, PropTypes } from 'horizon/core';
import { UIComponent, UINode } from 'horizon/ui';

// ----------------------------------------------------------------
// NoOp class to bind the script to an empty object for export
class NoOp extends Component<typeof NoOp> {
  start() {};
}
Component.register(NoOp);
// ----------------------------------------------------------------

export interface IFtueTask {
  startTask(player: Player) : void;
  complete(player: Player) : void;
}

export class FtueTask<T> extends Component<typeof FtueTask & T> implements IFtueTask {
  static propsDefinition = {
    taskChapter: {type: PropTypes.Entity},
  };

  private taskChapter: FtueChapter | undefined;

  start() {
    if (this.props.taskChapter) {
      this.taskChapter = this.props.taskChapter.getComponents(FtueChapter)[0];
    }

    this.taskChapter?.addTask(this);
  }

  public startTask(player: Player) {
    console.log('FtueTask: ' + this.entity.name + ' started');
    this.onTaskStart(player);
  }

  public complete(player: Player) {
    console.log('FtueTask: ' + this.entity.name + ' completed');
    this.onTaskComplete(player);
    this.taskChapter?.completeTask(player, this.entity.name.get());
  }

  protected onTaskStart(player: Player) {}
  protected onTaskComplete(player: Player) {}
}

export class FtueTaskUI<T> extends UIComponent<typeof FtueTaskUI & T> implements IFtueTask {
  static propsDefinition = {
    taskId: {type: PropTypes.String},
    taskChapter: {type: PropTypes.Entity},
  };

  private taskChapter: FtueChapter | undefined;

  start() {
    if (this.props.taskChapter) {
      this.taskChapter = this.props.taskChapter.getComponents(FtueChapter)[0];
    }

    this.taskChapter?.addTask(this);
  }

  public startTask(player: Player) {
    console.log('FtueTaskUI: ' + this.props.taskId + ' started');
    this.onTaskStart(player);
  }

  public complete(player: Player) {
    console.log('FtueTaskUI: ' + this.props.taskId + ' completed');
    this.onTaskComplete(player);
    this.taskChapter?.completeTask(player, this.props.taskId);
  }

  initializeUI() { return new UINode<any>(); }
  protected onTaskStart(player: Player) {}
  protected onTaskComplete(player: Player) {}
}
