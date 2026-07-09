declare const wx: any;
declare const App: any;
declare const Page: any;
declare function getApp<T = any>(): T;
declare function getCurrentPages(): any[];

interface IAppOption {
  globalData: {
    groupId: string;
  };
}
